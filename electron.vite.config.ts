import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    },
    build: {
      rollupOptions: {
        input: {
          dashboard: resolve(__dirname, 'src/renderer/dashboard/index.html'),
          agent: resolve(__dirname, 'src/renderer/agent/index.html'),
          onboarding: resolve(__dirname, 'src/renderer/onboarding/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings/index.html'),
          'button-editor': resolve(__dirname, 'src/renderer/button-editor/index.html')
        }
      }
    }
  }
})
