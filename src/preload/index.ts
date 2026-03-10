import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'
import { Config, AppState, IPC } from '../shared/types'

exposeElectronAPI()

const clauboyAPI = {
  getConfig: (): Promise<Config> => ipcRenderer.invoke(IPC.CONFIG_GET),

  saveConfig: (config: Config): Promise<boolean> =>
    ipcRenderer.invoke(IPC.CONFIG_SAVE, config),

  getState: (): Promise<AppState> => ipcRenderer.invoke(IPC.STATE_GET),

  onStateUpdate: (cb: (state: AppState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppState): void => cb(state)
    ipcRenderer.on(IPC.STATE_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.STATE_UPDATE, handler)
  },

  openAgent: (issueNumber: number): Promise<void> =>
    ipcRenderer.invoke(IPC.AGENT_OPEN, issueNumber),

  injectPrompt: (issueNumber: number, prompt: string): Promise<void> =>
    ipcRenderer.invoke(IPC.AGENT_INJECT_PROMPT, issueNumber, prompt),

  teardown: (issueNumber: number): Promise<void> =>
    ipcRenderer.invoke(IPC.AGENT_TEARDOWN, issueNumber),

  retryAgent: (issueNumber: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.AGENT_RETRY, issueNumber),

  attachTerminal: (issueNumber: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TERMINAL_ATTACH, issueNumber),

  onTerminalData: (cb: (data: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string): void => cb(data)
    ipcRenderer.on(IPC.TERMINAL_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.TERMINAL_DATA, handler)
  },

  sendTerminalInput: (issueNumber: number, data: string): void =>
    ipcRenderer.send(IPC.TERMINAL_INPUT, issueNumber, data),

  resizeTerminal: (issueNumber: number, cols: number, rows: number): void =>
    ipcRenderer.send(IPC.TERMINAL_RESIZE, issueNumber, cols, rows),

  buildImage: (
    onLog: (log: string) => void,
    imageName?: string
  ): Promise<boolean> => {
    const handler = (_event: Electron.IpcRendererEvent, log: string): void => onLog(log)
    ipcRenderer.on(IPC.DOCKER_BUILD_LOG, handler)
    return ipcRenderer
      .invoke(IPC.DOCKER_BUILD_IMAGE, imageName)
      .finally(() => ipcRenderer.removeListener(IPC.DOCKER_BUILD_LOG, handler))
  },

  pullImage: (
    imageName: string,
    onLog: (log: string) => void
  ): Promise<boolean> => {
    const handler = (_event: Electron.IpcRendererEvent, log: string): void => onLog(log)
    ipcRenderer.on(IPC.DOCKER_PULL_LOG, handler)
    return ipcRenderer
      .invoke(IPC.DOCKER_PULL_IMAGE, imageName)
      .finally(() => ipcRenderer.removeListener(IPC.DOCKER_PULL_LOG, handler))
  },

  checkDocker: (): Promise<boolean> => ipcRenderer.invoke(IPC.DOCKER_CHECK),

  forceSync: (): Promise<boolean> => ipcRenderer.invoke(IPC.GITHUB_FORCE_SYNC),

  cloneRepo: (onProgress: (msg: string) => void): Promise<boolean> => {
    const handler = (_event: Electron.IpcRendererEvent, msg: string): void =>
      onProgress(msg)
    ipcRenderer.on(IPC.GITHUB_CLONE_PROGRESS, handler)
    return ipcRenderer
      .invoke(IPC.GITHUB_CLONE_REPO)
      .finally(() =>
        ipcRenderer.removeListener(IPC.GITHUB_CLONE_PROGRESS, handler)
      )
  },

  createIssueUrl: (title?: string, body?: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GITHUB_CREATE_ISSUE_URL, title, body),

  validateGithubToken: (token: string): Promise<{ login: string; name: string | null }> =>
    ipcRenderer.invoke(IPC.GITHUB_VALIDATE_TOKEN, token),

  listRepos: (token: string): Promise<Array<{ owner: string; name: string }>> =>
    ipcRenderer.invoke(IPC.GITHUB_LIST_REPOS, token),

  listAllIssues: (): Promise<import('../shared/types').GitHubIssue[]> =>
    ipcRenderer.invoke(IPC.GITHUB_LIST_ALL_ISSUES),

  labelIssue: (issueNumber: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.GITHUB_LABEL_ISSUE, issueNumber),

  createGithubApp: (owner: string): Promise<{ appId: string; privateKey: string; installUrl: string; slug: string }> =>
    ipcRenderer.invoke(IPC.GITHUB_CREATE_APP, owner),

  getInstallationId: (appId: string, privateKey: string, owner: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.GITHUB_GET_INSTALLATION_ID, appId, privateKey, owner),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SYSTEM_OPEN_EXTERNAL, url),

  openInEditor: (filePath: string, command?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SYSTEM_OPEN_IN_EDITOR, filePath, command),

  confirm: (message: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SYSTEM_CONFIRM, message),

  completeOnboarding: (config: Config): Promise<boolean> =>
    ipcRenderer.invoke(IPC.ONBOARDING_COMPLETE, config),

  openSettings: (): Promise<void> => ipcRenderer.invoke('window:settings'),
  openButtonEditor: (): Promise<void> => ipcRenderer.invoke('window:button-editor'),

  openAuthTerminal: (issueNumber: number): Promise<void> =>
    ipcRenderer.invoke(IPC.AGENT_AUTH_TERMINAL, issueNumber),

  getTerminalUrl: (issueNumber: number): Promise<string> =>
    ipcRenderer.invoke(IPC.AGENT_TERMINAL_URL, issueNumber),

  cleanupOrphan: (worktreePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.AGENT_CLEANUP_ORPHAN, worktreePath),

  onConfigUpdate: (cb: (config: Config) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, config: Config): void => cb(config)
    ipcRenderer.on(IPC.CONFIG_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.CONFIG_UPDATE, handler)
  },

  getContainerLogs: (issueNumber: number): Promise<string> =>
    ipcRenderer.invoke(IPC.DOCKER_CONTAINER_LOGS, issueNumber),

  onLogData: (cb: (entry: import('../shared/types').LogEntry) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: import('../shared/types').LogEntry): void => cb(entry)
    ipcRenderer.on(IPC.LOG_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.LOG_DATA, handler)
  }
}

contextBridge.exposeInMainWorld('clauboy', clauboyAPI)

export type ClauboyAPI = typeof clauboyAPI
