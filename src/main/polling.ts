import {
  fetchClauboyIssues,
  getLabelEvents,
  getNewComments,
  postComment
} from './github'
import { appState } from './state'
import { startContainer } from './docker'
import { createWorktree, worktreeExists } from './worktree'
import { loadConfig } from './config'
import { ClauboyLabel, IssueState } from '../shared/types'

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
    const issues = await fetchClauboyIssues()

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

      const issueState: IssueState = existing ?? {
        issue,
        containerId: null,
        containerStatus: 'none',
        worktreePath: null,
        clauboyLabels,
        lastKnownCommentId: null,
        loadingStep: null
      }

      // Update issue data
      issueState.issue = issue
      issueState.clauboyLabels = clauboyLabels

      // Check if we should start a container (trusted user added clauboy label)
      if (
        clauboyLabels.includes('clauboy') &&
        !clauboyLabels.includes('clauboy:running') &&
        !clauboyLabels.includes('clauboy:done') &&
        issueState.containerStatus === 'none'
      ) {
        const events = await getLabelEvents(issue.number)
        const clauboyLabelEvent = events
          .filter(
            (e) =>
              e.event === 'labeled' &&
              e.label?.name === 'clauboy' &&
              e.actor?.login === config.github.trustedUser
          )
          .pop()

        if (clauboyLabelEvent) {
          // Start the agent
          issueState.loadingStep = 'Creating worktree...'
          issueStates.push(issueState)
          appState.setState({ issues: issueStates })

          try {
            const wtPath = worktreeExists(config, issue.number)
              ? undefined
              : await createWorktree(config, issue.number)

            issueState.worktreePath = wtPath ?? issueState.worktreePath
            issueState.loadingStep = 'Starting container...'
            appState.updateIssue(issue.number, issueState)

            const actualWtPath = issueState.worktreePath
            if (!actualWtPath) {
              throw new Error('No worktree path available')
            }

            const containerId = await startContainer(issue.number, config, actualWtPath)
            issueState.containerId = containerId
            issueState.containerStatus = 'running'
            issueState.loadingStep = null
            appState.updateIssue(issue.number, issueState)
          } catch (err) {
            console.error(`Failed to start agent for issue ${issue.number}:`, err)
            issueState.containerStatus = 'error'
            issueState.loadingStep = null
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
            const lastComment = newComments[newComments.length - 1]
            issueState.lastKnownCommentId = lastComment.id

            // Post neutral activity hint (no raw content injected)
            await postComment(
              issue.number,
              `Es gibt neue Aktivität in Issue #${issue.number}. Bitte lies die aktuellen Kommentare via GitHub CLI und entscheide selbst wie du reagierst.`
            )
          }
        } catch (err) {
          console.error('Failed to check comments:', err)
        }
      }

      issueStates.push(issueState)
    }

    appState.setState({
      issues: issueStates,
      isSyncing: false,
      lastSyncAt: new Date().toISOString()
    })
  } catch (err) {
    console.error('Poll tick failed:', err)
    appState.setState({ isSyncing: false })
  } finally {
    isPolling = false
  }
}
