import Dockerode from 'dockerode'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { WebContents } from 'electron'
import { Config } from '../shared/types'
import { getInstallationToken } from './github'
import { logger } from './logger'

export const TERMINAL_PORT_BASE = 37680

let docker: Dockerode | null = null

export function initDocker(config: Config): void {
  if (config.docker.socketPath) {
    logger.info(`Docker: using socketPath=${config.docker.socketPath}`)
    docker = new Dockerode({ socketPath: config.docker.socketPath })
  } else if (config.docker.host) {
    logger.info(`Docker: using host=${config.docker.host} port=${config.docker.port ?? 2375}`)
    docker = new Dockerode({
      host: config.docker.host,
      port: config.docker.port ?? 2375
    })
  } else {
    logger.info('Docker: using Windows default pipe //./pipe/docker_engine')
    docker = new Dockerode({ socketPath: '//./pipe/docker_engine' })
  }
}

function getDocker(): Dockerode {
  if (!docker) {
    // Try default Windows pipe
    docker = new Dockerode({ socketPath: '//./pipe/docker_engine' })
  }
  return docker
}

export async function checkDocker(): Promise<boolean> {
  try {
    await getDocker().ping()
    logger.info('Docker: ping OK')
    return true
  } catch (err) {
    logger.error(`Docker: ping failed — ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

export async function ensureNetwork(name: string): Promise<void> {
  const d = getDocker()
  const networks = await d.listNetworks({ filters: { name: [name] } })
  if (!networks.find((n) => n.Name === name)) {
    await d.createNetwork({ Name: name, Driver: 'bridge' })
  }
}

export async function imageExists(imageName: string): Promise<boolean> {
  try {
    const d = getDocker()
    const images = await d.listImages({ filters: { reference: [imageName] } })
    return images.length > 0
  } catch {
    return false
  }
}

export async function startContainer(
  issueNumber: number,
  config: Config,
  issueTitle = ''
): Promise<string> {
  const d = getDocker()
  await ensureNetwork(config.docker.networkName)

  const containerName = `clauboy-issue-${issueNumber}`

  // Remove existing container with same name if any
  try {
    const existing = d.getContainer(containerName)
    const info = await existing.inspect()
    logger.info(`Docker: removing existing container "${containerName}" (running=${info.State.Running})`)
    if (info.State.Running) {
      await existing.stop()
    }
    await existing.remove()
    logger.info(`Docker: removed old container "${containerName}"`)
  } catch {
    logger.debug(`Docker: no existing container "${containerName}" to remove`)
  }

  // Use a GitHub App installation token for gh CLI (so comments/PRs appear as the bot),
  // but always pass the PAT as GITHUB_PAT for git operations (app may lack repo access).
  const installationToken = await getInstallationToken()
  if (installationToken) {
    logger.info(`Docker: using GitHub App installation token for gh CLI on issue #${issueNumber}`)
  }

  const env: string[] = []
  env.push(`ISSUE_NUMBER=${issueNumber}`)
  env.push(`ISSUE_TITLE=${issueTitle}`)
  env.push(`GH_TOKEN=${installationToken ?? config.github.token}`)
  env.push(`GITHUB_PAT=${config.github.token}`)
  env.push(`GITHUB_OWNER=${config.github.owner}`)
  env.push(`GITHUB_REPO=${config.github.repo}`)

  const claudeAuthDir = path.join(os.homedir(), '.clauboy', 'claude-auth')
  fs.mkdirSync(claudeAuthDir, { recursive: true })
  const settingsFile = path.join(claudeAuthDir, 'settings.json')
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({ theme: 'dark' }))
  }

  // Sync OAuth credentials from host ~/.claude/.credentials.json so containers
  // can use subscription auth instead of a (potentially depleted) API key
  const hostCredentials = path.join(os.homedir(), '.claude', '.credentials.json')
  const authCredentials = path.join(claudeAuthDir, '.credentials.json')
  if (fs.existsSync(hostCredentials)) {
    fs.copyFileSync(hostCredentials, authCredentials)
    logger.info('Docker: synced OAuth credentials from host ~/.claude to container auth dir')
  }

  // Sync ~/.claude.json (main config, lives OUTSIDE ~/.claude/) so Claude skips
  // the first-run theme/login wizard. Same approach as claude-code-docker.
  const hostClaudeJson = path.join(os.homedir(), '.claude.json')
  const authClaudeJson = path.join(claudeAuthDir, '..', 'claude.json')
  if (fs.existsSync(hostClaudeJson)) {
    fs.copyFileSync(hostClaudeJson, authClaudeJson)
    logger.info('Docker: synced ~/.claude.json from host')
  } else {
    // Attempt restore from largest backup inside ~/.claude/backups/ (same fallback as claude-code-docker)
    const backupsDir = path.join(os.homedir(), '.claude', 'backups')
    if (fs.existsSync(backupsDir)) {
      const backups = fs.readdirSync(backupsDir)
        .filter((f) => f.startsWith('.claude.json.backup.'))
        .map((f) => ({ f, size: fs.statSync(path.join(backupsDir, f)).size }))
        .sort((a, b) => b.size - a.size)
      if (backups.length > 0) {
        fs.copyFileSync(path.join(backupsDir, backups[0].f), authClaudeJson)
        logger.info(`Docker: restored ~/.claude.json from backup ${backups[0].f}`)
      }
    }
  }

  const binds = [
    `${claudeAuthDir.replace(/\\/g, '/')}:/home/agent/.claude`
  ]
  const normalizedAuthClaudeJson = path.resolve(authClaudeJson).replace(/\\/g, '/')
  if (fs.existsSync(authClaudeJson)) {
    binds.push(`${normalizedAuthClaudeJson}:/home/agent/.claude.json`)
  }

  const hostConfig: Dockerode.HostConfig = {
    NetworkMode: config.docker.networkName,
    Binds: binds,
    PortBindings: {
      '7681/tcp': [{ HostPort: String(TERMINAL_PORT_BASE + issueNumber) }]
    }
  }

  if (config.docker.memoryLimit) {
    const memBytes = parseMemory(config.docker.memoryLimit)
    if (memBytes > 0) hostConfig.Memory = memBytes
  }

  if (config.docker.cpuLimit) {
    hostConfig.NanoCpus = Math.floor(parseFloat(config.docker.cpuLimit) * 1e9)
  }

  const container = await d.createContainer({
    Image: config.docker.imageName,
    name: containerName,
    Env: env,
    WorkingDir: '/workspace',
    ExposedPorts: {
      '7681/tcp': {}
    },
    HostConfig: hostConfig,
    Labels: {
      'clauboy.issue': String(issueNumber),
      'clauboy.managed': 'true'
    }
  })

  logger.info(`Docker: creating container "${containerName}" image="${config.docker.imageName}"`)
  await container.start()
  const startInfo = await container.inspect()
  logger.info(`Docker: container "${containerName}" started — id=${container.id.slice(0, 12)} status=${startInfo.State.Status}`)
  return container.id
}

export async function stopContainer(containerIdOrName: string): Promise<void> {
  const d = getDocker()
  try {
    const container = d.getContainer(containerIdOrName)
    const info = await container.inspect()
    const short = containerIdOrName.slice(0, 12)
    if (!info.State.Running) {
      logger.info(`Docker: container ${short} already stopped`)
      return
    }
    logger.info(`Docker: stopping container ${short}`)
    await container.stop({ t: 10 })
    logger.info(`Docker: container ${short} stopped`)
  } catch (err) {
    logger.error(`Docker: failed to stop container ${containerIdOrName.slice(0, 12)} — ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function runAgentPrompt(
  issueNumber: number,
  prompt: string,
  _webContents?: WebContents
): Promise<void> {
  const containerName = `clauboy-issue-${issueNumber}`
  logger.info(`Docker: injecting prompt into tmux for issue #${issueNumber} (${prompt.length} chars)`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', [
      'exec', containerName,
      'tmux', 'send-keys', '-t', 'claude-agent',
      prompt, 'Enter'
    ])
    proc.on('close', (code) => {
      if (code === 0) {
        logger.info(`Docker: prompt injected for issue #${issueNumber}`)
        resolve()
      } else {
        reject(new Error(`tmux send-keys failed with code ${code}`))
      }
    })
    proc.on('error', reject)
  })
}

export function getTerminalPort(issueNumber: number): number {
  return TERMINAL_PORT_BASE + issueNumber
}

export async function buildImage(
  dockerfilePath: string,
  imageName: string,
  onLog: (log: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dockerfileDir = path.dirname(dockerfilePath)
    const dockerfileName = path.basename(dockerfilePath)

    const proc = spawn('docker', [
      'build',
      '-t',
      imageName,
      '-f',
      dockerfileName,
      '.'
    ], { cwd: dockerfileDir })

    proc.stdout.on('data', (data: Buffer) => {
      onLog(data.toString())
    })

    proc.stderr.on('data', (data: Buffer) => {
      onLog(data.toString())
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`docker build exited with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}

export async function pullImage(
  imageName: string,
  onLog: (log: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['pull', imageName])

    proc.stdout.on('data', (data: Buffer) => {
      onLog(data.toString())
    })

    proc.stderr.on('data', (data: Buffer) => {
      onLog(data.toString())
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`docker pull exited with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}

export async function listRunningContainers(): Promise<
  Array<{ id: string; issueNumber: number; status: string }>
> {
  const d = getDocker()
  const containers = await d.listContainers({
    all: true,
    filters: { label: ['clauboy.managed=true'] }
  })

  return containers.map((c) => ({
    id: c.Id,
    issueNumber: parseInt(c.Labels['clauboy.issue'] ?? '0', 10),
    status: c.State
  }))
}

function parseMemory(memStr: string): number {
  const match = memStr.match(/^(\d+(?:\.\d+)?)\s*([kmgKMG]?)$/)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = match[2].toLowerCase()
  switch (unit) {
    case 'k': return Math.floor(value * 1024)
    case 'm': return Math.floor(value * 1024 * 1024)
    case 'g': return Math.floor(value * 1024 * 1024 * 1024)
    default: return Math.floor(value)
  }
}

export async function captureAgentPane(issueNumber: number): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('docker', [
      'exec', `clauboy-issue-${issueNumber}`,
      'tmux', 'capture-pane', '-t', 'claude-agent', '-p'
    ])
    let out = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', () => resolve(out))
    proc.on('error', () => resolve(''))
  })
}

export async function getContainerLogs(issueNumber: number, tail: number = 100): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('docker', [
      'logs', '--tail', String(tail), `clauboy-issue-${issueNumber}`
    ])
    let out = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', () => resolve(out))
    proc.on('error', () => resolve(''))
  })
}

export function openAuthTerminal(issueNumber: number): void {
  const containerName = `clauboy-issue-${issueNumber}`
  const cmd = `docker exec -it ${containerName} claude auth login`
  spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', cmd], { detached: true })
}

export async function getDockerfilePath(): Promise<string> {
  // Check resources/Dockerfile
  const resourcePath = path.join(process.resourcesPath ?? '', 'resources', 'Dockerfile')
  if (fs.existsSync(resourcePath)) return resourcePath

  // Dev fallback
  const devPath = path.join(__dirname, '..', '..', 'resources', 'Dockerfile')
  if (fs.existsSync(devPath)) return devPath

  throw new Error('Dockerfile not found')
}
