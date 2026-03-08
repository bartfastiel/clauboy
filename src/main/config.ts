import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { Config, DEFAULT_BUTTONS } from '../shared/types'

// CLAUBOY_CONFIG_DIR allows tests (and portable installs) to redirect config
// without touching Electron's HOME or USERPROFILE, which would crash the process.
const configDir = process.env['CLAUBOY_CONFIG_DIR'] ?? path.join(app.getPath('home'), '.clauboy')
const configPath = path.join(configDir, 'config.yaml')

export function getConfigDir(): string {
  return configDir
}

function ensureDirectories(): void {
  const dirs = [
    configDir,
    path.join(configDir, 'auth'),
    path.join(configDir, 'repos')
  ]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}

const DEFAULT_CONFIG: Config = {
  github: {
    token: '',
    owner: '',
    repo: '',
    trustedUser: '',
    appId: '',
    installationId: '',
    privateKey: ''
  },
  docker: {
    socketPath: '//./pipe/docker_engine',
    imageName: 'bartfastiel/clauboy-agent:latest',
    networkName: 'clauboy-net',
    memoryLimit: '2g',
    cpuLimit: '1.0'
  },
  buttons: DEFAULT_BUTTONS,
  language: 'en',
  editorCommand: 'code',
  claudeApiKey: '',
  cloneDir: path.join(app.getPath('home'), '.clauboy', 'repos'),
  setupComplete: false
}

function encryptToken(token: string): string {
  if (!token || !safeStorage.isEncryptionAvailable()) {
    return token
  }
  const encrypted = safeStorage.encryptString(token)
  return encrypted.toString('base64')
}

function decryptToken(encryptedB64: string): string {
  if (!encryptedB64) return ''
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return encryptedB64
    }
    const buf = Buffer.from(encryptedB64, 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    // If decryption fails, the value may not be encrypted (plain text fallback)
    return encryptedB64
  }
}

interface RawConfig {
  github?: {
    token?: string
    owner?: string
    repo?: string
    trustedUser?: string
    appId?: string
    installationId?: string
    privateKey?: string
    _tokenEncrypted?: boolean
    _privateKeyEncrypted?: boolean
  }
  docker?: Partial<Config['docker']>
  buttons?: Config['buttons']
  language?: Config['language']
  editorCommand?: string
  claudeApiKey?: string
  _claudeApiKeyEncrypted?: boolean
  cloneDir?: string
  setupComplete?: boolean
}

export function loadConfig(): Config {
  ensureDirectories()

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as RawConfig
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_CONFIG }
    }

    const config: Config = {
      ...DEFAULT_CONFIG,
      ...raw,
      github: {
        ...DEFAULT_CONFIG.github,
        ...(raw.github ?? {}),
        token: raw.github?._tokenEncrypted
          ? decryptToken(raw.github.token ?? '')
          : (raw.github?.token ?? ''),
        privateKey: raw.github?._privateKeyEncrypted
          ? decryptToken(raw.github.privateKey ?? '')
          : (raw.github?.privateKey ?? '')
      },
      docker: {
        ...DEFAULT_CONFIG.docker,
        ...(raw.docker ?? {})
      },
      claudeApiKey: raw._claudeApiKeyEncrypted
        ? decryptToken(raw.claudeApiKey ?? '')
        : (raw.claudeApiKey ?? ''),
      // Resolve cloneDir to absolute path if it's relative
      cloneDir: raw.cloneDir
        ? (path.isAbsolute(raw.cloneDir) ? raw.cloneDir : path.resolve(raw.cloneDir))
        : DEFAULT_CONFIG.cloneDir
    }

    return config
  } catch (err) {
    console.error('Failed to load config:', err)
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: Config): void {
  ensureDirectories()

  const toSave: RawConfig = {
    github: {
      owner: config.github.owner,
      repo: config.github.repo,
      trustedUser: config.github.trustedUser,
      appId: config.github.appId,
      installationId: config.github.installationId
    },
    docker: config.docker,
    buttons: config.buttons,
    language: config.language,
    editorCommand: config.editorCommand,
    cloneDir: config.cloneDir,
    setupComplete: config.setupComplete
  }

  // Encrypt sensitive fields
  if (config.github.token) {
    toSave.github = {
      ...toSave.github,
      token: encryptToken(config.github.token),
      _tokenEncrypted: safeStorage.isEncryptionAvailable()
    }
  }

  if (config.github.privateKey) {
    toSave.github = {
      ...toSave.github,
      privateKey: encryptToken(config.github.privateKey),
      _privateKeyEncrypted: safeStorage.isEncryptionAvailable()
    }
  }

  if (config.claudeApiKey) {
    toSave.claudeApiKey = encryptToken(config.claudeApiKey)
    toSave._claudeApiKeyEncrypted = safeStorage.isEncryptionAvailable()
  }

  fs.writeFileSync(configPath, yaml.dump(toSave), 'utf-8')
}
