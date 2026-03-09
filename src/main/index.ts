import { app, BrowserWindow, Menu } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { loadConfig } from './config'
import { initGitHub, ensureLabelsExist, fetchClauboyIssues } from './github'
import { initDocker, listRunningContainers } from './docker'
import { stopPolling, startActivityPolling, stopActivityPolling } from './polling'
import { appState } from './state'
import {
  createDashboardWindow,
  createOnboardingWindow
} from './windows'
import { registerIpcHandlers } from './ipc-handlers'
import { IssueState } from '../shared/types'
import { logger } from './logger'

async function startupSync(): Promise<void> {
  try {
    logger.info('Startup sync: fetching issues and Docker containers...')
    const issues = await fetchClauboyIssues()
    logger.info(`Startup sync: ${issues.length} issue(s) found`)

    const runningContainers = await listRunningContainers()
    logger.info(`Startup sync: ${runningContainers.length} Docker container(s) found: ${runningContainers.map((c) => `issue-${c.issueNumber}(${c.status})`).join(', ') || 'none'}`)
    const containerMap = new Map(
      runningContainers.map((c) => [c.issueNumber, c])
    )

    const issueStates: IssueState[] = issues.map((issue) => {
      const container = containerMap.get(issue.number)
      const clauboyLabels = issue.labels
        .map((l) => l.name)
        .filter((name) =>
          ['clauboy', 'clauboy:running', 'clauboy:done', 'clauboy:paused', 'clauboy:error'].includes(
            name
          )
        ) as IssueState['clauboyLabels']

      const containerStatus = container
        ? (container.status === 'running' ? 'running' : 'stopped')
        : 'none'

      logger.info(`Startup sync: issue #${issue.number} "${issue.title}" — labels=[${clauboyLabels.join(',')}] containerStatus=${containerStatus}`)

      return {
        issue,
        containerId: container?.id ?? null,
        containerStatus,
        worktreePath: null,
        terminalPort: container && containerStatus === 'running' ? 37680 + issue.number : null,
        clauboyLabels,
        lastKnownCommentId: null,
        loadingStep: null,
        agentActivity: null
      }
    })

    appState.setState({
      isOnboarding: false,
      issues: issueStates,
      isSyncing: false,
      lastSyncAt: new Date().toISOString()
    })
    logger.info('Startup sync complete')
  } catch (err) {
    logger.error(`Startup sync failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.clauboy.app')
  Menu.setApplicationMenu(null)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  const config = loadConfig()

  // Check if onboarding is needed — skip if already completed or has full config
  const hasMinConfig = !!(config.github.token && config.github.owner && config.github.repo)
  const needsOnboarding = !config.setupComplete && !hasMinConfig

  if (needsOnboarding) {
    appState.setState({ isOnboarding: true })
    createOnboardingWindow()
  } else {
    try {
      initGitHub(config)
      initDocker(config)

      await ensureLabelsExist()
      await startupSync()
      startActivityPolling()
    } catch (err) {
      console.error('Failed to initialize:', err)
    }

    createDashboardWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const cfg = loadConfig()
      const needs = !cfg.setupComplete && !(cfg.github.token && cfg.github.owner && cfg.github.repo)
      if (needs) {
        createOnboardingWindow()
      } else {
        createDashboardWindow()
      }
    }
  })
})

app.on('window-all-closed', () => {
  stopPolling()
  // Don't quit – containers keep running
  // On macOS, don't quit either
  if (process.platform !== 'darwin') {
    // Keep running in tray-like fashion – just don't quit outright
    // app.quit()
  }
})

app.on('before-quit', () => {
  stopPolling()
  stopActivityPolling()
})
