import { BrowserWindow, shell, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'logo.png')
    : join(__dirname, '../../resources/logo.png')
}

const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

// Track open agent windows
const agentWindows = new Map<number, BrowserWindow>()
let dashboardWindow: BrowserWindow | null = null
let onboardingWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let buttonEditorWindow: BrowserWindow | null = null

function getRendererUrl(name: string, params?: Record<string, string>): string | null {
  if (is.dev && RENDERER_URL) {
    // electron-vite sets src/renderer as the Vite root, so pages are served at /<name>/index.html
    const url = new URL(`${RENDERER_URL}/${name}/index.html`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }
    return url.toString()
  }
  return null
}

function loadWindow(
  win: BrowserWindow,
  name: string,
  params?: Record<string, string>
): void {
  const url = getRendererUrl(name, params)
  if (url) {
    win.loadURL(url).catch((err) => console.error(`[windows] loadURL failed for ${name}:`, err))
  } else {
    win.loadFile(join(__dirname, `../renderer/${name}/index.html`), {
      query: params
    }).catch((err) => console.error(`[windows] loadFile failed for ${name}:`, err))
  }

  win.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
    console.error(`[windows] did-fail-load name=${name} code=${code} desc=${desc} url=${failedUrl}`)
  })

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl)
    return { action: 'deny' }
  })

  if (is.dev && process.env['OPEN_DEVTOOLS'] === '1') {
    win.webContents.openDevTools({ mode: 'detach' })
  }
}

export function createDashboardWindow(): BrowserWindow {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus()
    return dashboardWindow
  }

  const win = new BrowserWindow({
    width: 400,
    height: 600,
    resizable: true,
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: 'Clauboy'
  })

  loadWindow(win, 'dashboard')

  win.on('closed', () => {
    dashboardWindow = null
  })

  dashboardWindow = win
  return win
}

export function createAgentWindow(issueNumber: number, title?: string): BrowserWindow {
  const existing = agentWindows.get(issueNumber)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return existing
  }

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: true,
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: title ? `#${issueNumber} – ${title}` : `#${issueNumber}`
  })

  loadWindow(win, 'agent', { issue: String(issueNumber) })

  win.on('closed', () => {
    agentWindows.delete(issueNumber)
  })

  agentWindows.set(issueNumber, win)
  return win
}

export function createOnboardingWindow(): BrowserWindow {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus()
    return onboardingWindow
  }

  const win = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: 'Clauboy Setup'
  })

  loadWindow(win, 'onboarding')

  win.on('closed', () => {
    onboardingWindow = null
  })

  onboardingWindow = win
  return win
}

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return settingsWindow
  }

  const win = new BrowserWindow({
    width: 550,
    height: 700,
    resizable: true,
    icon: iconPath(),
    parent: dashboardWindow ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: 'Settings'
  })

  loadWindow(win, 'settings')

  win.on('closed', () => {
    settingsWindow = null
  })

  settingsWindow = win
  return win
}

export function createButtonEditorWindow(): BrowserWindow {
  if (buttonEditorWindow && !buttonEditorWindow.isDestroyed()) {
    buttonEditorWindow.focus()
    return buttonEditorWindow
  }

  const win = new BrowserWindow({
    width: 700,
    height: 600,
    resizable: true,
    icon: iconPath(),
    parent: dashboardWindow ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: 'Button Editor'
  })

  loadWindow(win, 'button-editor')

  win.on('closed', () => {
    buttonEditorWindow = null
  })

  buttonEditorWindow = win
  return win
}

export function getAgentWindow(issueNumber: number): BrowserWindow | null {
  return agentWindows.get(issueNumber) ?? null
}

export function closeAgentWindow(issueNumber: number): void {
  const win = agentWindows.get(issueNumber)
  if (win && !win.isDestroyed()) {
    win.close()
  }
  agentWindows.delete(issueNumber)
}

export function getDashboardWindow(): BrowserWindow | null {
  return dashboardWindow
}
