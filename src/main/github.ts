import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import {
  Config,
  GitHubIssue,
  GitHubComment,
  ClauboyLabel,
  LABEL_COLORS
} from '../shared/types'

let octokit: Octokit | null = null
let appOctokit: Octokit | null = null
let currentConfig: Config | null = null

export function initGitHub(config: Config): void {
  currentConfig = config
  octokit = new Octokit({ auth: config.github.token })

  if (config.github.appId && config.github.installationId && config.github.privateKey) {
    appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.github.appId,
        privateKey: config.github.privateKey,
        installationId: parseInt(config.github.installationId, 10)
      }
    })
  }
}

function getOctokit(): Octokit {
  if (!octokit) throw new Error('GitHub not initialized')
  return octokit
}

function getConfig(): Config {
  if (!currentConfig) throw new Error('GitHub not initialized')
  return currentConfig
}

const CLAUBOY_LABEL_NAMES = new Set<string>([
  'clauboy', 'clauboy:running', 'clauboy:done', 'clauboy:paused', 'clauboy:error'
])

function mapIssue(issue: {
  number: number; title: string; body?: string | null; html_url: string
  state: string; created_at: string; updated_at: string
  user?: { login?: string; id?: number; avatar_url?: string } | null
  labels: Array<string | { name?: string | null; color?: string | null }>
}): GitHubIssue {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? null,
    html_url: issue.html_url,
    state: issue.state as 'open' | 'closed',
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    user: {
      login: issue.user?.login ?? '',
      id: issue.user?.id ?? 0,
      avatar_url: issue.user?.avatar_url ?? ''
    },
    labels: issue.labels.map((l) => ({
      name: typeof l === 'string' ? l : (l.name ?? ''),
      color: typeof l === 'string' ? '' : (l.color ?? '')
    }))
  }
}

// Single API call instead of one-per-label (saves ~4 req/poll at 30 s intervals)
export async function fetchClauboyIssues(): Promise<GitHubIssue[]> {
  const oc = getOctokit()
  const cfg = getConfig()

  const response = await oc.issues.listForRepo({
    owner: cfg.github.owner,
    repo: cfg.github.repo,
    state: 'open',
    per_page: 100
  })

  return response.data
    .filter((issue) =>
      issue.labels.some((l) => {
        const name = typeof l === 'string' ? l : (l.name ?? '')
        return CLAUBOY_LABEL_NAMES.has(name)
      })
    )
    .map(mapIssue)
}

export async function fetchAllOpenIssues(): Promise<GitHubIssue[]> {
  const oc = getOctokit()
  const cfg = getConfig()

  const response = await oc.issues.listForRepo({
    owner: cfg.github.owner,
    repo: cfg.github.repo,
    state: 'open',
    per_page: 100,
    sort: 'updated'
  })

  return response.data.map(mapIssue)
}

export async function ensureLabelsExist(): Promise<void> {
  const oc = getOctokit()
  const cfg = getConfig()

  const existingLabels = await oc.issues.listLabelsForRepo({
    owner: cfg.github.owner,
    repo: cfg.github.repo,
    per_page: 100
  })

  const existingNames = new Set(existingLabels.data.map((l) => l.name))

  for (const [labelName, color] of Object.entries(LABEL_COLORS)) {
    if (!existingNames.has(labelName)) {
      try {
        await oc.issues.createLabel({
          owner: cfg.github.owner,
          repo: cfg.github.repo,
          name: labelName,
          color: color
        })
      } catch (err) {
        console.error(`Failed to create label ${labelName}:`, err)
      }
    }
  }
}

export async function setLabel(
  issueNumber: number,
  add: ClauboyLabel[],
  remove: ClauboyLabel[]
): Promise<void> {
  const oc = getOctokit()
  const cfg = getConfig()

  // Get current labels
  const response = await oc.issues.get({
    owner: cfg.github.owner,
    repo: cfg.github.repo,
    issue_number: issueNumber
  })

  const currentLabels = response.data.labels
    .map((l) => (typeof l === 'string' ? l : (l.name ?? '')))
    .filter((name) => name.length > 0)

  const newLabels = [
    ...currentLabels.filter((l) => !remove.includes(l as ClauboyLabel)),
    ...add.filter((l) => !currentLabels.includes(l))
  ]

  await oc.issues.setLabels({
    owner: cfg.github.owner,
    repo: cfg.github.repo,
    issue_number: issueNumber,
    labels: newLabels
  })
}

export async function postComment(issueNumber: number, body: string): Promise<void> {
  const oc = appOctokit ?? getOctokit()
  const cfg = getConfig()

  await oc.issues.createComment({
    owner: cfg.github.owner,
    repo: cfg.github.repo,
    issue_number: issueNumber,
    body
  })
}

export async function getNewComments(
  issueNumber: number,
  sinceId: number | null
): Promise<GitHubComment[]> {
  const oc = getOctokit()
  const cfg = getConfig()

  const response = await oc.issues.listComments({
    owner: cfg.github.owner,
    repo: cfg.github.repo,
    issue_number: issueNumber,
    per_page: 100
  })

  const comments: GitHubComment[] = response.data.map((c) => ({
    id: c.id,
    body: c.body ?? '',
    user: {
      login: c.user?.login ?? '',
      id: c.user?.id ?? 0,
      avatar_url: c.user?.avatar_url ?? ''
    },
    created_at: c.created_at
  }))

  if (sinceId === null) {
    return comments
  }

  const sinceIdx = comments.findIndex((c) => c.id === sinceId)
  if (sinceIdx === -1) {
    return comments
  }

  return comments.slice(sinceIdx + 1)
}

export async function getInstallationToken(): Promise<string | null> {
  if (!currentConfig) return null
  const { appId, privateKey, installationId } = currentConfig.github
  if (!appId || !privateKey || !installationId) return null

  try {
    const auth = createAppAuth({ appId, privateKey })
    const result = await auth({ type: 'installation', installationId: parseInt(installationId, 10) })
    return result.token
  } catch (err) {
    console.error('Failed to get installation token:', err)
    return null
  }
}

export async function getLabelEvents(issueNumber: number): Promise<
  Array<{
    event: string
    label?: { name: string }
    actor?: { login: string }
    created_at: string
  }>
> {
  const oc = getOctokit()
  const cfg = getConfig()

  const response = await oc.issues.listEventsForTimeline({
    owner: cfg.github.owner,
    repo: cfg.github.repo,
    issue_number: issueNumber,
    per_page: 100
  })

  return response.data
    .filter((e): e is typeof e & { event: string } => e.event === 'labeled' || e.event === 'unlabeled')
    .map((e) => ({
      event: e.event,
      label:
        'label' in e && e.label
          ? { name: (e.label as { name: string }).name }
          : undefined,
      actor:
        'actor' in e && e.actor
          ? { login: (e.actor as { login: string }).login }
          : undefined,
      created_at: 'created_at' in e ? String(e.created_at) : ''
    }))
}

export function buildCreateIssueUrl(
  config: Config,
  title?: string,
  body?: string
): string {
  const base = `https://github.com/${config.github.owner}/${config.github.repo}/issues/new`
  const params = new URLSearchParams()
  if (title) params.set('title', title)
  if (body) params.set('body', body)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}
