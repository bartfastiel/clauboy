// Shared types used by both main and renderer processes

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  ts: string
  level: LogLevel
  msg: string
}


export type ButtonType = 'prompt' | 'ide' | 'web' | 'teardown' | 'pause' | 'resume'

export interface Button {
  id: string
  icon: string
  label: string
  type: ButtonType
  prompt?: string
  command?: string
  url?: string
}

export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
}

export interface GitHubIssue {
  number: number
  title: string
  body: string | null
  html_url: string
  state: 'open' | 'closed'
  created_at: string
  updated_at: string
  user: GitHubUser
  labels: Array<{ name: string; color: string }>
}

export interface GitHubComment {
  id: number
  body: string
  user: GitHubUser
  created_at: string
}

export type ClauboyLabel =
  | 'clauboy'
  | 'clauboy:running'
  | 'clauboy:done'
  | 'clauboy:paused'
  | 'clauboy:error'

export const LABEL_COLORS: Record<ClauboyLabel, string> = {
  clauboy: '0075ca',
  'clauboy:running': '2ea44f',
  'clauboy:done': '8957e5',
  'clauboy:paused': 'e3b341',
  'clauboy:error': 'd73a49'
}

export type ContainerStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'none'

export interface IssueState {
  issue: GitHubIssue
  containerId: string | null
  containerStatus: ContainerStatus
  worktreePath: string | null
  terminalPort: number | null
  clauboyLabels: ClauboyLabel[]
  lastKnownCommentId: number | null
  loadingStep: string | null
  errorMessage?: string | null
  agentIsRunning?: boolean
}

export interface AppState {
  isOnboarding: boolean
  issues: IssueState[]
  orphanWorktrees: string[]
  isSyncing: boolean
  lastSyncAt: string | null
}

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  trustedUser: string
  appId?: string
  installationId?: string
  privateKey?: string
}

export interface DockerConfig {
  socketPath?: string
  host?: string
  port?: number
  imageName: string
  networkName: string
  cpuLimit?: string
  memoryLimit?: string
}

export interface Config {
  github: GitHubConfig
  docker: DockerConfig
  buttons: Button[]
  language: 'en' | 'de'
  editorCommand: string
  claudeApiKey?: string
  cloneDir?: string
  setupComplete?: boolean
}

// IPC channel names
export const IPC = {
  CONFIG_GET: 'config:get',
  CONFIG_SAVE: 'config:save',
  STATE_GET: 'state:get',
  STATE_UPDATE: 'state:update',
  AGENT_OPEN: 'agent:open',
  AGENT_INJECT_PROMPT: 'agent:inject-prompt',
  AGENT_TEARDOWN: 'agent:teardown',
  TERMINAL_ATTACH: 'terminal:attach',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  DOCKER_BUILD_IMAGE: 'docker:build-image',
  DOCKER_BUILD_LOG: 'docker:build-log',
  DOCKER_PULL_IMAGE: 'docker:pull-image',
  DOCKER_PULL_LOG: 'docker:pull-log',
  DOCKER_CHECK: 'docker:check',
  GITHUB_FORCE_SYNC: 'github:force-sync',
  GITHUB_CLONE_REPO: 'github:clone-repo',
  GITHUB_CLONE_PROGRESS: 'github:clone-progress',
  GITHUB_CREATE_ISSUE_URL: 'github:create-issue-url',
  GITHUB_VALIDATE_TOKEN: 'github:validate-token',
  GITHUB_LIST_REPOS: 'github:list-repos',
  GITHUB_CREATE_APP: 'github:create-app',
  GITHUB_GET_INSTALLATION_ID: 'github:get-installation-id',
  GITHUB_LIST_ALL_ISSUES: 'github:list-all-issues',
  GITHUB_LABEL_ISSUE: 'github:label-issue',
  AGENT_RETRY: 'agent:retry',
  ANTHROPIC_VALIDATE_KEY: 'anthropic:validate-key',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_OPEN_IN_EDITOR: 'system:open-in-editor',
  SYSTEM_CONFIRM: 'system:confirm',
  ONBOARDING_COMPLETE: 'onboarding:complete',
  AGENT_AUTH_TERMINAL: 'agent:auth-terminal',
  AGENT_TERMINAL_URL: 'agent:terminal-url',
  AGENT_CLEANUP_ORPHAN: 'agent:cleanup-orphan',
  AGENT_PAUSE: 'agent:pause',
  AGENT_RESUME: 'agent:resume',
  LOG_DATA: 'log:data'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export const DEFAULT_BUTTONS: Button[] = [
  {
    id: 'start',
    icon: '🚀',
    label: 'Start',
    type: 'prompt',
    prompt:
      'Du arbeitest an Issue #{{ISSUE_NUMBER}}. Das Issue findest du hier: {{ISSUE_URL}}\n\nLies das Issue sorgfältig mit `gh issue view {{ISSUE_NUMBER}}` und beginne mit der Implementierung. Nutze `gh issue view {{ISSUE_NUMBER}} --comments` um aktuelle Kommentare zu sehen.'
  },
  {
    id: 'conceive',
    icon: '💡',
    label: 'Conceive',
    type: 'prompt',
    prompt:
      'Analysiere Issue #{{ISSUE_NUMBER}} und erstelle einen detaillierten Implementierungsplan. Beschreibe welche Dateien du ändern möchtest und warum.'
  },
  {
    id: 'document',
    icon: '📝',
    label: 'Document',
    type: 'prompt',
    prompt:
      'Dokumentiere die Änderungen die du für Issue #{{ISSUE_NUMBER}} gemacht hast. Aktualisiere README oder relevante Docs.'
  },
  {
    id: 'prs',
    icon: '🔀',
    label: 'PRs',
    type: 'prompt',
    prompt:
      'Erstelle einen Pull Request für Issue #{{ISSUE_NUMBER}}. Commitiere alle Änderungen, pushe den Branch und erstelle den PR mit `gh pr create`.'
  },
  {
    id: 'ide',
    icon: '🖥️',
    label: 'IDE',
    type: 'ide',
    command: 'code'
  },
  {
    id: 'issue',
    icon: '🐛',
    label: 'Issue',
    type: 'web',
    url: '{{ISSUE_URL}}'
  },
  {
    id: 'teardown',
    icon: '🛑',
    label: 'Teardown',
    type: 'teardown'
  }
]
