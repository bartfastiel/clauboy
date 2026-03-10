import {
  fetchClauboyIssues,
  getLabelEvents,
  getInstallationToken
} from './github'
import { spawn } from 'child_process'
import { appState } from './state'
import * as path from 'path'
import * as fs from 'fs'
import { startContainer, listRunningContainers, captureAgentPane, TERMINAL_PORT_BASE } from './docker'
import { loadConfig } from './config'
import { ClauboyLabel, IssueState } from '../shared/types'
import { logger } from './logger'

let pollingInterval: ReturnType<typeof setInterval> | null = null
let activityInterval: ReturnType<typeof setInterval> | null = null
let isPolling = false
let rateLimitBackoffUntil = 0

const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000 // 45 minutes
const lastTokenRefreshAt = new Map<number, number>()

async function refreshContainerToken(issueNumber: number): Promise<void> {
  const token = await getInstallationToken()
  if (!token) return
  const last = lastTokenRefreshAt.get(issueNumber) ?? 0
  if (Date.now() - last < TOKEN_REFRESH_INTERVAL_MS) return
  // Mark immediately so retries don't pile up even on failure
  lastTokenRefreshAt.set(issueNumber, Date.now())
  return new Promise((resolve) => {
    // Update GH_TOKEN in the tmux session environment so future gh invocations use the fresh token
    const proc = spawn('docker', [
      'exec', `clauboy-issue-${issueNumber}`,
      'tmux', 'set-environment', '-g', 'GH_TOKEN', token
    ])
    proc.on('close', (code) => {
      if (code === 0) {
        logger.info(`Issue #${issueNumber}: refreshed GH_TOKEN in tmux environment`)
      } else {
        logger.warn(`Issue #${issueNumber}: tmux set-environment failed with code ${code}`)
      }
      resolve()
    })
    proc.on('error', () => resolve())
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
    refreshContainerToken(issueState.issue.number).catch(() => {})
    try {
      const pane = await captureAgentPane(issueState.issue.number)
      // eslint-disable-next-line no-control-regex
      const stripped = pane.replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
      const activity = stripped.includes('esc to interrupt') ? 'working' : 'waiting'
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

async function runPollTick(): Promise<void> {
  if (isPolling) return
  if (Date.now() < rateLimitBackoffUntil) {
    logger.warn(`Poll tick skipped — rate limit backoff until ${new Date(rateLimitBackoffUntil).toISOString()}`)
    return
  }
  isPolling = true

  try {
    appState.setState({ isSyncing: true })
    const config = loadConfig()
    logger.debug(`Poll tick — trustedUser=${config.github.trustedUser} repo=${config.github.owner}/${config.github.repo}`)

    // Reconcile actual Docker state before processing issues
    const runningContainers = await listRunningContainers().catch(() => [])
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
        worktreePath: null,
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
      }

      // Check if we should start a container (trusted user added clauboy label)
      const shouldConsiderStart =
        clauboyLabels.includes('clauboy') &&
        !clauboyLabels.includes('clauboy:running') &&
        !clauboyLabels.includes('clauboy:done') &&
        (issueState.containerStatus === 'none' || issueState.containerStatus === 'stopped')

      logger.debug(`Issue #${issue.number} shouldConsiderStart=${shouldConsiderStart} (containerStatus=${issueState.containerStatus})`)

      if (shouldConsiderStart) {
        logger.info(`Issue #${issue.number}: checking label events for trusted user "${config.github.trustedUser}"`)
        const events = await getLabelEvents(issue.number)
        logger.debug(`Issue #${issue.number}: got ${events.length} label event(s)`)

        const clauboyLabelEvent = events
          .filter(
            (e) =>
              e.event === 'labeled' &&
              e.label?.name === 'clauboy' &&
              e.actor?.login === config.github.trustedUser
          )
          .pop()

        if (!clauboyLabelEvent) {
          logger.warn(`Issue #${issue.number}: no "clauboy" label event from trustedUser "${config.github.trustedUser}" found — not starting. All labelers: [${events.filter((e) => e.event === 'labeled' && e.label?.name === 'clauboy').map((e) => e.actor?.login).join(', ')}]`)
        } else {
          logger.info(`Issue #${issue.number}: trusted user "${clauboyLabelEvent.actor?.login}" labeled at ${clauboyLabelEvent.created_at} — starting agent`)

          // Start the agent — show progress without pushing to issueStates twice
          issueState.loadingStep = 'Starting container...'
          const alreadyInState = appState.getState().issues.some((i) => i.issue.number === issue.number)
          if (alreadyInState) {
            appState.updateIssue(issue.number, issueState)
          } else {
            appState.setState({ issues: [...appState.getState().issues, issueState] })
          }

          try {
            const wsPath = path.join(
              config.cloneDir ?? '',
              `${config.github.owner}-${config.github.repo}`,
              'workspaces',
              `issue-${issue.number}`
            )
            fs.mkdirSync(wsPath, { recursive: true })
            logger.info(`Issue #${issue.number}: workspace path="${wsPath}"`)
            issueState.worktreePath = wsPath
            issueState.loadingStep = 'Starting container...'
            appState.updateIssue(issue.number, issueState)

            logger.info(`Issue #${issue.number}: starting Docker container with workspace="${wsPath}" image="${config.docker.imageName}"`)
            const containerId = await startContainer(issue.number, config, wsPath, issue.title)
            logger.info(`Issue #${issue.number}: container started id=${containerId.slice(0, 12)}`)
            issueState.containerId = containerId
            issueState.containerStatus = 'running'
            issueState.terminalPort = TERMINAL_PORT_BASE + issue.number
            issueState.loadingStep = null
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
      }


      issueStates.push(issueState)
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
