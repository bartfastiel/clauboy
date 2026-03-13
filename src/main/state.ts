import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { AppState, IssueState, IPC } from '../shared/types'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const STATE_FILE = path.join(os.homedir(), '.clauboy', 'state.json')
const PERSIST_DEBOUNCE_MS = 2000

class StateManager extends EventEmitter {
  private state: AppState = {
    isOnboarding: true,
    issues: [],
    isSyncing: false,
    lastSyncAt: null
  }

  private persistTimer: ReturnType<typeof setTimeout> | null = null

  getState(): AppState {
    return { ...this.state }
  }

  setState(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial }
    this.broadcastState()
    this.emit('state-update', this.state)
    this.schedulePersist()
  }

  updateIssue(issueNumber: number, partial: Partial<IssueState>): void {
    const idx = this.state.issues.findIndex((i) => i.issue.number === issueNumber)
    if (idx === -1) {
      return
    }
    const updatedIssues = [...this.state.issues]
    updatedIssues[idx] = { ...updatedIssues[idx], ...partial }
    this.state = { ...this.state, issues: updatedIssues }
    this.broadcastState()
    this.emit('state-update', this.state)
    this.schedulePersist()
  }

  removeIssue(issueNumber: number): void {
    this.state = { ...this.state, issues: this.state.issues.filter((i) => i.issue.number !== issueNumber) }
    this.broadcastState()
    this.emit('state-update', this.state)
    this.schedulePersist()
  }

  broadcastState(): void {
    const state = this.getState()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.STATE_UPDATE, state)
      }
    }
  }

  /** Restore persisted issue state from disk (call once at startup, before first poll) */
  restoreFromDisk(): IssueState[] {
    try {
      if (!fs.existsSync(STATE_FILE)) return []
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const data = JSON.parse(raw)
      if (Array.isArray(data?.issues)) {
        return data.issues as IssueState[]
      }
    } catch {
      // Corrupt or missing file — start fresh
    }
    return []
  }

  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.writeToDisk()
    }, PERSIST_DEBOUNCE_MS)
  }

  private writeToDisk(): void {
    try {
      const dir = path.dirname(STATE_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      // Only persist issue tracking data — ephemeral flags like isSyncing are not useful on disk
      const payload = { issues: this.state.issues, lastSyncAt: this.state.lastSyncAt }
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2))
    } catch {
      // Best-effort — don't crash if disk write fails
    }
  }
}

export const appState = new StateManager()
