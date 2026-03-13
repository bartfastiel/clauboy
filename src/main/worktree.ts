import * as path from 'path'
import * as fs from 'fs'
import { simpleGit } from 'simple-git'
import { Config } from '../shared/types'

export function repoPath(config: Config): string {
  const cloneDir = config.cloneDir ?? process.env['CLAUBOY_CONFIG_DIR'] ?? path.join(process.env['USERPROFILE'] ?? '~', '.clauboy', 'repos')
  return path.join(cloneDir, `${config.github.owner}-${config.github.repo}`, 'clone')
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
