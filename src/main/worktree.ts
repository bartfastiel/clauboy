import * as path from 'path'
import * as fs from 'fs'
import { simpleGit, SimpleGit } from 'simple-git'
import { Config } from '../shared/types'
import { logger } from './logger'

export function repoPath(config: Config): string {
  const cloneDir = config.cloneDir ?? process.env['CLAUBOY_CONFIG_DIR'] ?? path.join(process.env['USERPROFILE'] ?? '~', '.clauboy', 'repos')
  return path.join(cloneDir, `${config.github.owner}-${config.github.repo}`, 'clone')
}

export function worktreePath(config: Config, issueNumber: number): string {
  const cloneDir = config.cloneDir ?? path.join(process.env['USERPROFILE'] ?? '~', '.clauboy', 'repos')
  return path.join(
    cloneDir,
    `${config.github.owner}-${config.github.repo}`,
    'worktrees',
    `issue-${issueNumber}`
  )
}

function getRepoUrl(config: Config): string {
  return `https://${config.github.token}@github.com/${config.github.owner}/${config.github.repo}.git`
}

export async function cloneRepo(
  config: Config,
  onProgress: (message: string) => void
): Promise<void> {
  const targetPath = repoPath(config)

  if (fs.existsSync(targetPath)) {
    onProgress('Repository already exists, pulling latest changes...')
    const git = simpleGit(targetPath)
    await git.pull()
    onProgress('Repository updated.')
    return
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })

  const git = simpleGit()
  onProgress(`Cloning ${config.github.owner}/${config.github.repo}...`)

  await git.clone(getRepoUrl(config), targetPath, {
    '--progress': null
  })

  onProgress('Clone complete.')
}

export async function createWorktree(
  config: Config,
  issueNumber: number
): Promise<string> {
  const repoDir = repoPath(config)
  const wtPath = worktreePath(config, issueNumber)
  const branchName = `issue-${issueNumber}`

  fs.mkdirSync(path.dirname(wtPath), { recursive: true })

  // Auto-clone if repo doesn't exist yet
  if (!fs.existsSync(repoDir)) {
    await cloneRepo(config, () => {})
  }

  // First pull the latest
  const git = simpleGit(repoDir)
  await git.pull()

  // Check if branch already exists
  const branches = await git.branchLocal()
  const branchExists = branches.all.includes(branchName)

  if (worktreeExists(config, issueNumber)) {
    return wtPath
  }

  // Prune stale worktree references before adding (prevents "already exists" errors)
  await git.raw(['worktree', 'prune'])

  if (branchExists) {
    await git.raw(['worktree', 'add', wtPath, branchName])
  } else {
    await git.raw(['worktree', 'add', '-b', branchName, wtPath])
  }

  return wtPath
}

export async function removeWorktree(
  config: Config,
  issueNumber: number
): Promise<void> {
  const repoDir = repoPath(config)
  const wtPath = worktreePath(config, issueNumber)
  const git = simpleGit(repoDir)

  try {
    await git.raw(['worktree', 'remove', '--force', wtPath])
  } catch (err) {
    logger.error(`Failed to remove worktree: ${err instanceof Error ? err.message : String(err)}`)
    // Try manual cleanup
    if (fs.existsSync(wtPath)) {
      fs.rmSync(wtPath, { recursive: true, force: true })
    }
  }
}

export function worktreeExists(config: Config, issueNumber: number): boolean {
  const wtPath = worktreePath(config, issueNumber)
  return fs.existsSync(wtPath)
}

export async function listOrphanWorktrees(
  config: Config,
  activeIssueNumbers: number[]
): Promise<string[]> {
  const repoDir = repoPath(config)
  if (!fs.existsSync(repoDir)) return []

  const git: SimpleGit = simpleGit(repoDir)
  const worktrees = await git.raw(['worktree', 'list', '--porcelain'])
  const lines = worktrees.split('\n')

  const orphans: string[] = []
  let currentPath: string | null = null

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim()
    } else if (line.startsWith('branch ') && currentPath) {
      const branch = line.slice('branch '.length).trim()
      const match = branch.match(/issue-(\d+)$/)
      if (match) {
        const issueNum = parseInt(match[1], 10)
        if (!activeIssueNumbers.includes(issueNum)) {
          orphans.push(currentPath)
        }
      }
    }
  }

  return orphans
}
