import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { loadConfig, saveConfig } from './config'
import { initGitHub, ensureLabelsExist, fetchClauboyIssues } from './github'
import { initDocker, listRunningContainers } from './docker'
import { startPolling, stopPolling } from './polling'
import { appState } from './state'
import {
  createDashboardWindow,
  createOnboardingWindow
} from './windows'
import { registerIpcHandlers } from './ipc-handlers'
import { IssueState } from '../shared/types'

async function startupSync(): Promise<void> {
  try {
    const issues = await fetchClauboyIssues()

    const runningContainers = await listRunningContainers()
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

      return {
        issue,
        containerId: container?.id ?? null,
        containerStatus: container ? (container.status === 'running' ? 'running' : 'stopped') : 'none',
        worktreePath: null,
        clauboyLabels,
        lastKnownCommentId: null,
        loadingStep: null
      }
    })

    appState.setState({
      isOnboarding: false,
      issues: issueStates,
      isSyncing: false,
      lastSyncAt: new Date().toISOString()
    })
  } catch (err) {
    console.error('Startup sync failed:', err)
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.clauboy.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  const config = loadConfig()

  // Check if onboarding is needed
  const needsOnboarding =
    !config.github.token || !config.github.owner || !config.github.repo

  if (needsOnboarding) {
    appState.setState({ isOnboarding: true })
    createOnboardingWindow()
  } else {
    try {
      initGitHub(config)
      initDocker(config)

      await ensureLabelsExist()
      await startupSync()
      startPolling(30000)
    } catch (err) {
      console.error('Failed to initialize:', err)
    }

    createDashboardWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const cfg = loadConfig()
      const needs = !cfg.github.token || !cfg.github.owner || !cfg.github.repo
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
})
