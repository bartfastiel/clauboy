import { ipcMain, dialog, shell } from 'electron'
import { spawn } from 'child_process'
import { IPC, Config } from '../shared/types'
import { Octokit } from '@octokit/rest'
import { loadConfig, saveConfig } from './config'
import { appState } from './state'
import {
  createAgentWindow,
  createDashboardWindow,
  createSettingsWindow,
  createButtonEditorWindow,
  getAgentWindow,
  closeAgentWindow
} from './windows'
import {
  runAgentPrompt,
  buildImage,
  pullImage,
  checkDocker,
  stopContainer,
  getDockerfilePath,
  openAuthTerminal,
  getTerminalPort
} from './docker'
import { removeWorktree } from './worktree'
import { forceSync } from './polling'
import { cloneRepo } from './worktree'
import { setLabel, postComment, buildCreateIssueUrl, initGitHub, fetchAllOpenIssues } from './github'
import { startPolling } from './polling'
import { createGithubAppViaManifest, getInstallationId } from './github-app-manifest'

export function registerIpcHandlers(): void {
  // Config
  ipcMain.handle(IPC.CONFIG_GET, () => loadConfig())

  ipcMain.handle(IPC.CONFIG_SAVE, (_event, config: Config) => {
    saveConfig(config)
    return true
  })

  // State
  ipcMain.handle(IPC.STATE_GET, () => appState.getState())

  // Agent window
  ipcMain.handle(IPC.AGENT_OPEN, (_event, issueNumber: number) => {
    const state = appState.getState()
    const issueState = state.issues.find((i) => i.issue.number === issueNumber)
    createAgentWindow(issueNumber, issueState?.issue.title)
  })

  // Prompt injection: injects via tmux send-keys into the interactive claude session
  ipcMain.handle(IPC.AGENT_INJECT_PROMPT, async (_event, issueNumber: number, prompt: string) => {
    appState.updateIssue(issueNumber, { agentIsRunning: true })
    try {
      await runAgentPrompt(issueNumber, prompt)
    } finally {
      // With tmux interactive mode, we return quickly — reset after a short delay
      setTimeout(() => appState.updateIssue(issueNumber, { agentIsRunning: false }), 2000)
    }
  })

  // Terminal URL for the ttyd web terminal
  ipcMain.handle(IPC.AGENT_TERMINAL_URL, (_event, issueNumber: number) => {
    return `http://localhost:${getTerminalPort(issueNumber)}`
  })

  // Teardown workflow
  ipcMain.handle(IPC.AGENT_TEARDOWN, async (_event, issueNumber: number) => {
    const win = getAgentWindow(issueNumber)
    const webContents = win?.webContents

    // Step 1: Ask agent to commit/push any remaining work
    if (webContents && !webContents.isDestroyed()) {
      await runAgentPrompt(
        issueNumber,
        'Any uncommitted changes or unpushed commits? Please commit and push now.',
        webContents
      ).catch((err) => console.error('Teardown prompt failed:', err))
    }

    const state = appState.getState()
    const issueState = state.issues.find((i) => i.issue.number === issueNumber)

    const config = loadConfig()

    // Step 2: Stop container — try by stored ID first, fall back to well-known name
    if (issueState?.containerId) {
      await stopContainer(issueState.containerId)
    } else {
      await stopContainer(`clauboy-issue-${issueNumber}`)
    }

    // Step 3: Remove worktree
    await removeWorktree(config, issueNumber).catch((err) =>
      console.error('removeWorktree failed:', err)
    )

    // Step 4: Remove ALL clauboy labels so issue disappears from the list
    await setLabel(issueNumber, [], ['clauboy', 'clauboy:running', 'clauboy:done', 'clauboy:paused', 'clauboy:error'])

    // Step 5: Post bot comment
    await postComment(issueNumber, '🤠 Agent done.')

    // Step 6: Remove issue from state immediately so it vanishes from the list
    appState.removeIssue(issueNumber)

    // Step 7: Close agent window
    closeAgentWindow(issueNumber)
  })

  // Docker
  ipcMain.handle(IPC.DOCKER_BUILD_IMAGE, async (event, imageName?: string) => {
    const config = loadConfig()
    const dockerfilePath = await getDockerfilePath()
    const name = imageName ?? config.docker.imageName

    await buildImage(dockerfilePath, name, (log: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.DOCKER_BUILD_LOG, log)
      }
    })

    return true
  })

  ipcMain.handle(IPC.DOCKER_PULL_IMAGE, async (event, imageName: string) => {
    await pullImage(imageName, (log: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.DOCKER_PULL_LOG, log)
      }
    })
    return true
  })

  ipcMain.handle(IPC.DOCKER_CHECK, () => checkDocker())

  // GitHub
  ipcMain.handle(IPC.GITHUB_FORCE_SYNC, async () => {
    await forceSync()
    return true
  })

  ipcMain.handle(IPC.GITHUB_CLONE_REPO, async (event) => {
    const config = loadConfig()
    await cloneRepo(config, (message: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.GITHUB_CLONE_PROGRESS, message)
      }
    })
    return true
  })

  ipcMain.handle(
    IPC.GITHUB_CREATE_ISSUE_URL,
    (_event, title?: string, body?: string) => {
      const config = loadConfig()
      const url = buildCreateIssueUrl(config, title, body)
      shell.openExternal(url)
      return url
    }
  )

  // System
  ipcMain.handle(IPC.SYSTEM_OPEN_EXTERNAL, (_event, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle(
    IPC.SYSTEM_OPEN_IN_EDITOR,
    (_event, filePath: string, command?: string) => {
      const cmd = command ?? 'code'
      const proc = spawn(cmd, [filePath], { shell: true, detached: true })
      proc.unref()
    }
  )

  ipcMain.handle(IPC.SYSTEM_CONFIRM, async (_event, message: string) => {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Yes', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message,
      title: 'Confirm'
    })
    return result.response === 0
  })

  // Onboarding complete
  ipcMain.handle(IPC.ONBOARDING_COMPLETE, (_event, config: Config) => {
    const completed = { ...config, setupComplete: true }
    saveConfig(completed)
    initGitHub(completed)
    startPolling()
    createDashboardWindow()
    return true
  })

  // Open settings/button-editor
  ipcMain.handle('window:settings', () => createSettingsWindow())
  ipcMain.handle('window:button-editor', () => createButtonEditorWindow())

  // GitHub token validation + user info
  ipcMain.handle(IPC.GITHUB_VALIDATE_TOKEN, async (_event, token: string) => {
    const oc = new Octokit({ auth: token })
    const { data } = await oc.users.getAuthenticated()
    return { login: data.login, name: data.name ?? null }
  })

  // List repos for authenticated user
  ipcMain.handle(IPC.GITHUB_LIST_REPOS, async (_event, token: string) => {
    const oc = new Octokit({ auth: token })
    const { data } = await oc.repos.listForAuthenticatedUser({ per_page: 100, sort: 'updated' })
    return data.map((r) => ({ owner: r.owner.login, name: r.name }))
  })

  // List all open issues (for browse/label UI)
  ipcMain.handle(IPC.GITHUB_LIST_ALL_ISSUES, () => fetchAllOpenIssues())

  // Add clauboy label to an issue and sync
  ipcMain.handle(IPC.GITHUB_LABEL_ISSUE, async (_event, issueNumber: number) => {
    await setLabel(issueNumber, ['clauboy'], [])
    await forceSync()
    return true
  })

  // Retry a failed agent by resetting its error state and re-running the poll
  ipcMain.handle(IPC.AGENT_RETRY, async (_event, issueNumber: number) => {
    appState.updateIssue(issueNumber, {
      containerStatus: 'none',
      errorMessage: null,
      loadingStep: null,
      containerId: null
    })
    await forceSync()
    return true
  })

  // GitHub App creation via manifest flow
  ipcMain.handle(IPC.GITHUB_CREATE_APP, async (_event, owner: string) => {
    return createGithubAppViaManifest(owner)
  })

  // Poll for GitHub App installation ID
  ipcMain.handle(IPC.GITHUB_GET_INSTALLATION_ID, async (_event, appId: string, privateKey: string, owner: string) => {
    return getInstallationId(appId, privateKey, owner)
  })

  // Open auth terminal for claude auth login
  ipcMain.handle(IPC.AGENT_AUTH_TERMINAL, (_event, issueNumber: number) => {
    openAuthTerminal(issueNumber)
  })

  // Anthropic API key validation
  ipcMain.handle(IPC.ANTHROPIC_VALIDATE_KEY, async (_event, apiKey: string) => {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    })
    if (!response.ok) throw new Error(`Invalid Anthropic API key (HTTP ${response.status})`)
    return true
  })
}
