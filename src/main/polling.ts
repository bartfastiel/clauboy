import {
  fetchClauboyIssues,
  getLabelEvents,
  getNewComments,
  postComment
} from './github'
import { appState } from './state'
import * as path from 'path'
import * as fs from 'fs'
import { startContainer, TERMINAL_PORT_BASE } from './docker'
import { loadConfig } from './config'
import { ClauboyLabel, IssueState } from '../shared/types'
import { logger } from './logger'

let pollingInterval: ReturnType<typeof setInterval> | null = null
let isPolling = false

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
  isPolling = true

  try {
    appState.setState({ isSyncing: true })
    const config = loadConfig()
    logger.debug(`Poll tick — trustedUser=${config.github.trustedUser} repo=${config.github.owner}/${config.github.repo}`)

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
          ['clauboy', 'clauboy:running', 'clauboy:done', 'clauboy:paused', 'clauboy:error'].includes(name)
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
        loadingStep: null
      }

      // Update issue data
      issueState.issue = issue
      issueState.clauboyLabels = clauboyLabels

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
            const containerId = await startContainer(issue.number, config, wsPath)
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

      // Check for new comments when container is running
      if (issueState.containerStatus === 'running') {
        try {
          const newComments = await getNewComments(
            issue.number,
            issueState.lastKnownCommentId
          )

          if (newComments.length > 0) {
            logger.info(`Issue #${issue.number}: ${newComments.length} new comment(s), notifying agent`)
            const lastComment = newComments[newComments.length - 1]
            issueState.lastKnownCommentId = lastComment.id

            // Post neutral activity hint (no raw content injected)
            await postComment(
              issue.number,
              `There is new activity on issue #${issue.number}. Please read the latest comments via \`gh issue view ${issue.number} --comments\` and decide how to respond.`
            )
          }
        } catch (err) {
          logger.error(`Issue #${issue.number}: failed to check comments — ${err instanceof Error ? err.message : String(err)}`)
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
    logger.error(`Poll tick failed — ${msg}`)
    appState.setState({ isSyncing: false })
  } finally {
    isPolling = false
  }
}
