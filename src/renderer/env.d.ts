/// <reference types="vite/client" />

import { ClauboyAPI } from '../preload/index'

declare global {
  interface Window {
    clauboy: ClauboyAPI
    electron: import('@electron-toolkit/preload').ElectronAPI
  }
}
