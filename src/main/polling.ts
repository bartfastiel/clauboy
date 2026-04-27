import {
  fetchClauboyIssues,
  getInstallationToken,
  getNewComments,
  addCommentReaction
} from './github'
import { spawn } from 'child_process'
import * as net from 'net'
import { appState } from './state'
import { startContainer, listRunningContainers, captureAgentPane, TERMINAL_PORT_BASE, imageExists, pullImage, runAgentPrompt, stopContainer, removeContainer } from './docker'
import { loadConfig } from './config'
import { ClauboyLabel, IssueState } from '../shared/types'
import { logger } from './logger'

let pollingInterval: ReturnType<typeof setInterval> | null = null
let activityInterval: ReturnType<typeof setInterval> | null = null
let isPolling = false
let rateLimitBackoffUntil = 0

const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000 // 45 minutes after success
const TOKEN_RETRY_INTERVAL_MS = 30 * 1000 // 30 seconds between failed attempts (avoid hammering during outage)
const lastTokenRefreshAt = new Map<number, number>() // last successful refresh
const lastTokenAttemptAt = new Map<number, number>() // last attempt (success or failure)

async function refreshContainerToken(issueNumber: number): Promise<void> {
  const now = Date.now()
  const lastSuccess = lastTokenRefreshAt.get(issueNumber) ?? 0
  const lastAttempt = lastTokenAttemptAt.get(issueNumber) ?? 0
  if (now - lastSuccess < TOKEN_REFRESH_INTERVAL_MS) return
  if (now - lastAttempt < TOKEN_RETRY_INTERVAL_MS) return
  // Reserve the retry slot so concurrent ticks don't pile up while we're awaiting
  lastTokenAttemptAt.set(issueNumber, now)

  const token = await getInstallationToken()
  if (!token) return

  const containerName = `clauboy-issue-${issueNumber}`

  // Write fresh token to /tmp/.gh_token (git credential helper + gh CLI read from here)
  const writeOk = await new Promise<boolean>((resolve) => {
    const proc = spawn('docker', [
      'exec', '-i', containerName,
      'bash', '-c', 'cat > /tmp/.gh_token'
    ])
    proc.stdin.write(token)
    proc.stdin.end()
    proc.on('close', (code) => {
      if (code === 0) {
        logger.info(`Issue #${issueNumber}: refreshed /tmp/.gh_token`)
        resolve(true)
      } else {
        logger.debug(`Issue #${issueNumber}: token file write failed (code ${code})`)
        resolve(false)
      }
    })
    proc.on('error', () => resolve(false))
  })
  if (!writeOk) return

  // Re-authenticate gh CLI with the new token.
  // GH_TOKEN env var must be unset, otherwise gh refuses to store credentials.
  const ghAuthOk = await new Promise<boolean>((resolve) => {
    const proc = spawn('docker', [
      'exec', containerName,
      'bash', '-c', 'unset GH_TOKEN; gh auth login --with-token < /tmp/.gh_token'
    ])
    proc.on('close', (code) => {
      if (code === 0) {
        logger.info(`Issue #${issueNumber}: gh auth refreshed`)
        resolve(true)
      } else {
        logger.debug(`Issue #${issueNumber}: gh auth login failed (code ${code})`)
        resolve(false)
      }
    })
    proc.on('error', () => resolve(false))
  })
  if (!ghAuthOk) return

  // Unset GH_TOKEN in the tmux session environment so gh CLI uses the refreshed
  // stored auth instead of the stale env var (which was set at container creation
  // and cannot be updated in running processes).
  await new Promise<void>((resolve) => {
    const proc = spawn('docker', [
      'exec', containerName,
      'tmux', 'set-environment', '-t', 'claude-agent', '-u', 'GH_TOKEN'
    ])
    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })

  lastTokenRefreshAt.set(issueNumber, now)
}

/** Quick TCP probe — resolves true if the port accepts a connection within timeoutMs. */
function isPortOpen(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => { resolve(false) })
    socket.connect(port, '127.0.0.1')
  })
}

function parseElapsedSeconds(text: string): number | null {
  // Matches patterns like "(14m 28s", "(5s", "(1h 3m 12s"
  const m = text.match(/\((?:(\d+)h\s+)?(?:(\d+)m\s+)?(\d+)s/)
  if (!m) return null
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseInt(m[3])
}

async function refreshAgentActivity(): Promise<void> {
  const issues = appState.getState().issues.filter((i) => i.containerStatus === 'running')
  for (const issueState of issues) {
    refreshContainerToken(issueState.issue.number).catch((err) =>
      logger.debug(`Issue #${issueState.issue.number}: token refresh failed — ${err instanceof Error ? err.message : String(err)}`)
    )
    try {
      const pane = await captureAgentPane(issueState.issue.number)
      // eslint-disable-next-line no-control-regex
      const stripped = pane.replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
      const isWorking = stripped.includes('esc to interrupt')
      // Detect whether Claude Code CLI has fully booted: look for the input
      // prompt character "❯" or the status-bar text "bypass permissions" which
      // only appear after ToS acceptance and full init.
      const cliReady = stripped.includes('\u276F') || stripped.includes('bypass permissions')
      // Only consider the agent booted once the terminal port (ttyd) is also
      // reachable — Claude may be ready in tmux before ttyd starts serving.
      const port = issueState.terminalPort ?? (TERMINAL_PORT_BASE + issueState.issue.number)
      const terminalUp = cliReady ? await isPortOpen(port) : false
      const hasBooted = cliReady && terminalUp
      let activity: 'working' | 'waiting' | null
      if (isWorking && terminalUp) {
        activity = 'working'
      } else if (issueState.agentActivity === 'working' || hasBooted) {
        // Claude finished working, OR Claude has booted and is at its prompt
        activity = 'waiting'
      } else {
        activity = issueState.agentActivity // keep null during startup
      }
      const elapsedSeconds = parseElapsedSeconds(stripped)
      const update: Partial<typeof issueState> = {}
      if (activity !== issueState.agentActivity) update.agentActivity = activity
      if (elapsedSeconds !== null) {
        update.agentElapsedSeconds = elapsedSeconds
        update.agentElapsedCapturedAt = new Date().toISOString()
      }
      if (Object.keys(update).length > 0) {
        appState.updateIssue(issueState.issue.number, update)
      }
    } catch {
      // ignore — container might not be ready
    }
  }
}

export function startActivityPolling(intervalMs: number = 3000): void {
  if (activityInterval) return
  activityInterval = setInterval(() => { void refreshAgentActivity() }, intervalMs)
  void refreshAgentActivity()
}

export function stopActivityPolling(): void {
  if (activityInterval) {
    clearInterval(activityInterval)
    activityInterval = null
  }
}

export function startPolling(intervalMs: number = 30000): void {
  if (pollingInterval) return

  pollingInterval = setInterval(() => {
    void runPollTick()
  }, intervalMs)

  // Run immediately
  void runPollTick()
}

export function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

export async function forceSync(): Promise<void> {
  await runPollTick()
}

const POLL_TIMEOUT_MS = 120_000 // 2 minutes — release the lock if a tick hangs
let pollStartedAt = 0

async function runPollTick(): Promise<void> {
  // Release a stuck lock if the previous tick exceeded the timeout
  if (isPolling && pollStartedAt > 0 && Date.now() - pollStartedAt > POLL_TIMEOUT_MS) {
    logger.warn(`Poll tick timeout — previous tick started ${Math.round((Date.now() - pollStartedAt) / 1000)}s ago, forcing unlock`)
    isPolling = false
  }
  if (isPolling) return
  if (Date.now() < rateLimitBackoffUntil) {
    logger.warn(`Poll tick skipped — rate limit backoff until ${new Date(rateLimitBackoffUntil).toISOString()}`)
    return
  }
  isPolling = true
  pollStartedAt = Date.now()

  try {
    appState.setState({ isSyncing: true })
    const config = loadConfig()
    logger.debug(`Poll tick — trustedUser=${config.github.trustedUser} repo=${config.github.owner}/${config.github.repo}`)

    // Reconcile actual Docker state before processing issues
    const runningContainers = await listRunningContainers().catch((err) => {
      logger.debug(`Docker container list failed — ${err instanceof Error ? err.message : String(err)}`)
      return []
    })
    const runningIssueNumbers = new Set(
      runningContainers.filter((c) => c.status === 'running').map((c) => c.issueNumber)
    )

    const issues = await fetchClauboyIssues()
    logger.info(`Fetched ${issues.length} clauboy issue(s): ${issues.map((i) => `#${i.number}`).join(', ') || 'none'}`)

    const currentState = appState.getState()
    const issueStates: IssueState[] = []

    for (const issue of issues) {
      const existing = currentState.issues.find(
        (i) => i.issue.number === issue.number
      )

      const clauboyLabels = issue.labels
        .map((l) => l.name)
        .filter((name): name is ClauboyLabel =>
          ['clauboy', 'clauboy:running', 'clauboy:done', 'clauboy:error'].includes(name)
        )

      logger.debug(`Issue #${issue.number} "${issue.title}" — labels=[${clauboyLabels.join(',')}] existingStatus=${existing?.containerStatus ?? 'N/A'}`)

      const issueState: IssueState = existing ?? {
        issue,
        containerId: null,
        containerStatus: 'none',
        terminalPort: null,
        clauboyLabels,
        lastKnownCommentId: null,
        loadingStep: null,
        agentActivity: null,
        agentElapsedSeconds: null,
        agentElapsedCapturedAt: null
      }

      // Update issue data
      issueState.issue = issue
      issueState.clauboyLabels = clauboyLabels

      // Reconcile container status against actual Docker state
      if (issueState.containerStatus === 'running' && !runningIssueNumbers.has(issue.number)) {
        logger.warn(`Issue #${issue.number}: container was 'running' in state but is not running in Docker — marking stopped`)
        issueState.containerStatus = 'stopped'
        issueState.containerId = null
      } else if (issueState.containerStatus !== 'running' && runningIssueNumbers.has(issue.number)) {
        logger.info(`Issue #${issue.number}: container is running in Docker but state was '${issueState.containerStatus}' — correcting`)
        issueState.containerStatus = 'running'
        issueState.terminalPort = TERMINAL_PORT_BASE + issue.number
        issueState.agentActivity = null
      }

      const assigneeLogins = issue.assignees.map((a) => a.login)
      const isMine = assigneeLogins.includes(config.github.trustedUser)
      const isUnassigned = assigneeLogins.length === 0

      // Check if we should start a container (trusted user added clauboy label)
      const shouldConsiderStart =
        clauboyLabels.includes('clauboy') &&
        !clauboyLabels.includes('clauboy:running') &&
        !clauboyLabels.includes('clauboy:done') &&
        (issueState.containerStatus === 'none' || issueState.containerStatus === 'stopped')

      logger.debug(`Issue #${issue.number} shouldConsiderStart=${shouldConsiderStart} isMine=${isMine} isUnassigned=${isUnassigned} (containerStatus=${issueState.containerStatus})`)

      if (shouldConsiderStart && isUnassigned) {
        logger.debug(`Issue #${issue.number}: no assignee — waiting to be grabbed`)
      } else if (shouldConsiderStart && !isMine) {
        logger.info(`Issue #${issue.number}: assigned to [${assigneeLogins.join(', ')}] (not "${config.github.trustedUser}") — skipping`)
      } else if (shouldConsiderStart && isMine) {
        logger.info(`Issue #${issue.number}: assigned to "${config.github.trustedUser}" — starting agent`)

        // Start the agent — show progress without pushing to issueStates twice
        issueState.loadingStep = 'Starting container...'
        const alreadyInState = appState.getState().issues.some((i) => i.issue.number === issue.number)
        if (alreadyInState) {
          appState.updateIssue(issue.number, issueState)
        } else {
          appState.setState({ issues: [...appState.getState().issues, issueState] })
        }

        try {
          // Auto-pull image if not available locally
          const hasImage = await imageExists(config.docker.imageName)
          if (!hasImage) {
            logger.info(`Issue #${issue.number}: image "${config.docker.imageName}" not found — pulling…`)
            issueState.loadingStep = 'Pulling image...'
            appState.updateIssue(issue.number, issueState)
            await pullImage(config.docker.imageName, (log) => logger.debug(`[pull] ${log.trim()}`))
            logger.info(`Issue #${issue.number}: image pulled successfully`)
          }

          issueState.loadingStep = 'Starting container...'
          appState.updateIssue(issue.number, issueState)
          logger.info(`Issue #${issue.number}: starting Docker container image="${config.docker.imageName}"`)
          const containerId = await startContainer(issue.number, config, issue.title)
          logger.info(`Issue #${issue.number}: container started id=${containerId.slice(0, 12)}`)
          issueState.containerId = containerId
          issueState.containerStatus = 'running'
          issueState.terminalPort = TERMINAL_PORT_BASE + issue.number
          issueState.loadingStep = null
          issueState.agentActivity = null
          issueState.agentElapsedSeconds = null
          issueState.agentElapsedCapturedAt = null
          appState.updateIssue(issue.number, issueState)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error(`Issue #${issue.number}: failed to start agent — ${msg}`)
          issueState.containerStatus = 'error'
          issueState.loadingStep = null
          issueState.errorMessage = msg
          appState.updateIssue(issue.number, issueState)
        }
      }


      // Notify agent about new human comments (ignore bot comments to prevent feedback loops)
      if (issueState.containerStatus === 'running') {
        try {
          const newComments = await getNewComments(
            issue.number,
            issueState.lastKnownCommentId
          )

          // Filter out bot comments (GitHub App bots have logins ending with [bot])
          const humanComments = newComments.filter((c) => !c.user.login.endsWith('[bot]'))

          if (newComments.length > 0) {
            // Always advance the cursor past all comments (including bot ones)
            issueState.lastKnownCommentId = newComments[newComments.length - 1].id
          }

          if (humanComments.length > 0) {
            // Remember which comment IDs we're forwarding BEFORE notifying,
            // so we only react to these — not to comments added in the meantime.
            const forwardedCommentIds = humanComments.map((c) => c.id)

            logger.info(`Issue #${issue.number}: ${humanComments.length} new human comment(s), notifying agent via tmux`)
            try {
              await runAgentPrompt(
                issue.number,
                `Es gibt neue Aktivität in Issue #${issue.number}. Bitte lies die aktuellen Kommentare via GitHub CLI und entscheide selbst wie du reagierst.`
              )
              // Add 👀 reaction to each forwarded comment so the author knows it was seen
              for (const commentId of forwardedCommentIds) {
                await addCommentReaction(commentId, 'eyes').catch((err) =>
                  logger.debug(`Issue #${issue.number}: failed to add 👀 to comment ${commentId} — ${err instanceof Error ? err.message : String(err)}`)
                )
              }
            } catch (err) {
              logger.debug(`Issue #${issue.number}: failed to notify agent — ${err instanceof Error ? err.message : String(err)}`)
            }
          }
        } catch (err) {
          logger.debug(`Issue #${issue.number}: comment check failed — ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      issueStates.push(issueState)
    }

    // Stop and remove orphaned containers (running but no longer have a clauboy label)
    const activeIssueNumbers = new Set(issues.map((i) => i.number))
    for (const container of runningContainers) {
      if (container.status === 'running' && !activeIssueNumbers.has(container.issueNumber)) {
        logger.info(`Orphaned container clauboy-issue-${container.issueNumber} — no clauboy label on issue, stopping and removing`)
        try {
          await stopContainer(container.id)
          await removeContainer(container.id)
        } catch (err) {
          logger.debug(`Failed to clean up orphaned container ${container.issueNumber} — ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    appState.setState({
      issues: issueStates,
      isSyncing: false,
      lastSyncAt: new Date().toISOString()
    })
    logger.debug(`Poll tick complete — ${issueStates.length} issue(s) in state`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // GitHub rate limit: back off for 5 minutes
    if (err instanceof Error && 'status' in err && (err as { status: number }).status === 403 || msg.includes('rate limit')) {
      rateLimitBackoffUntil = Date.now() + 5 * 60 * 1000
      logger.warn(`Poll tick: GitHub rate limit hit — backing off until ${new Date(rateLimitBackoffUntil).toISOString()}`)
    } else {
      logger.error(`Poll tick failed — ${msg}`)
    }
    appState.setState({ isSyncing: false })
  } finally {
    isPolling = false
  }
}
