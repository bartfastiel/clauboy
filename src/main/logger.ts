import { BrowserWindow } from 'electron'
import { IPC, LogLevel, LogEntry } from '../shared/types'

function broadcast(entry: LogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.LOG_DATA, entry)
    }
  }
}

export function log(level: LogLevel, msg: string): void {
  const entry: LogEntry = { ts: new Date().toISOString(), level, msg }
  const prefix = `[clauboy][${level.toUpperCase()}]`
  if (level === 'error') console.error(prefix, msg)
  else if (level === 'warn') console.warn(prefix, msg)
  else console.log(prefix, msg)
  broadcast(entry)
}

export const logger = {
  info: (msg: string) => log('info', msg),
  warn: (msg: string) => log('warn', msg),
  error: (msg: string) => log('error', msg),
  debug: (msg: string) => log('debug', msg)
}
