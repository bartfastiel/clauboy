import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { AppState, IssueState, IPC } from '../shared/types'

class StateManager extends EventEmitter {
  private state: AppState = {
    isOnboarding: true,
    issues: [],
    orphanWorktrees: [],
    isSyncing: false,
    lastSyncAt: null
  }

  getState(): AppState {
    return { ...this.state }
  }

  setState(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial }
    this.broadcastState()
    this.emit('state-update', this.state)
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
  }

  removeIssue(issueNumber: number): void {
    this.state = { ...this.state, issues: this.state.issues.filter((i) => i.issue.number !== issueNumber) }
    this.broadcastState()
    this.emit('state-update', this.state)
  }

  broadcastState(): void {
    const state = this.getState()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.STATE_UPDATE, state)
      }
    }
  }
}

export const appState = new StateManager()
