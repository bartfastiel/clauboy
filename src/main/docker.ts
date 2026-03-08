import Dockerode from 'dockerode'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { WebContents } from 'electron'
import { Config, IPC } from '../shared/types'

let docker: Dockerode | null = null

interface AttachmentEntry {
  stream: NodeJS.ReadWriteStream
  webContentsId: number
}

const attachments = new Map<number, AttachmentEntry>()

export function initDocker(config: Config): void {
  if (config.docker.socketPath) {
    docker = new Dockerode({ socketPath: config.docker.socketPath })
  } else if (config.docker.host) {
    docker = new Dockerode({
      host: config.docker.host,
      port: config.docker.port ?? 2375
    })
  } else {
    // Windows default
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
    return true
  } catch {
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

export async function startContainer(
  issueNumber: number,
  config: Config,
  worktreePath: string
): Promise<string> {
  const d = getDocker()
  await ensureNetwork(config.docker.networkName)

  const containerName = `clauboy-issue-${issueNumber}`

  // Remove existing container with same name if any
  try {
    const existing = d.getContainer(containerName)
    const info = await existing.inspect()
    if (info.State.Running) {
      await existing.stop()
    }
    await existing.remove()
  } catch {
    // Container doesn't exist, that's fine
  }

  const env: string[] = []
  if (config.claudeApiKey) {
    env.push(`ANTHROPIC_API_KEY=${config.claudeApiKey}`)
  }
  env.push(`ISSUE_NUMBER=${issueNumber}`)
  env.push(`GH_TOKEN=${config.github.token}`)
  env.push(`GITHUB_OWNER=${config.github.owner}`)
  env.push(`GITHUB_REPO=${config.github.repo}`)

  const hostConfig: Dockerode.HostConfig = {
    NetworkMode: config.docker.networkName,
    Binds: [`${worktreePath}:/workspace`],
    WorkingDir: '/workspace'
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
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,
    StdinOnce: false,
    Tty: true,
    HostConfig: hostConfig,
    Labels: {
      'clauboy.issue': String(issueNumber),
      'clauboy.managed': 'true'
    }
  })

  await container.start()
  return container.id
}

export async function stopContainer(containerId: string): Promise<void> {
  const d = getDocker()
  try {
    const container = d.getContainer(containerId)
    await container.stop({ t: 10 })
  } catch (err) {
    console.error('Failed to stop container:', err)
  }
}

export async function attachContainer(
  issueNumber: number,
  webContents: WebContents
): Promise<void> {
  const d = getDocker()
  const containerName = `clauboy-issue-${issueNumber}`
  const container = d.getContainer(containerName)

  const stream = await container.attach({
    stream: true,
    stdin: true,
    stdout: true,
    stderr: true
  })

  attachments.set(issueNumber, {
    stream: stream as NodeJS.ReadWriteStream,
    webContentsId: webContents.id
  })

  stream.on('data', (data: Buffer) => {
    if (!webContents.isDestroyed()) {
      webContents.send(IPC.TERMINAL_DATA, data.toString('base64'))
    }
  })

  stream.on('error', (err: Error) => {
    console.error(`Container stream error for issue ${issueNumber}:`, err)
    attachments.delete(issueNumber)
  })

  stream.on('end', () => {
    attachments.delete(issueNumber)
  })
}

export function sendInput(issueNumber: number, data: string): void {
  const attachment = attachments.get(issueNumber)
  if (attachment) {
    attachment.stream.write(data)
  }
}

export async function resizeTerminal(
  issueNumber: number,
  cols: number,
  rows: number
): Promise<void> {
  const d = getDocker()
  const containerName = `clauboy-issue-${issueNumber}`
  try {
    const container = d.getContainer(containerName)
    await container.resize({ w: cols, h: rows })
  } catch (err) {
    console.error('Failed to resize terminal:', err)
  }
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

export async function getDockerfilePath(): Promise<string> {
  // Check resources/Dockerfile
  const resourcePath = path.join(process.resourcesPath ?? '', 'resources', 'Dockerfile')
  if (fs.existsSync(resourcePath)) return resourcePath

  // Dev fallback
  const devPath = path.join(__dirname, '..', '..', '..', 'resources', 'Dockerfile')
  if (fs.existsSync(devPath)) return devPath

  throw new Error('Dockerfile not found')
}
