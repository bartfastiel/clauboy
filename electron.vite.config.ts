import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// @octokit/* v7+ are pure ESM. Exclude them from externalization so vite/rollup
// bundles and transforms them to CJS — keeping the main process as CJS, which is
// required for Playwright's --require loader injection to work.
const ESM_ONLY_PACKAGES = [
  '@octokit/rest',
  '@octokit/auth-app',
  '@octokit/core',
  '@octokit/request',
  '@octokit/endpoint',
  '@octokit/graphql',
  '@octokit/auth-token',
  '@octokit/plugin-rest-endpoint-methods',
  '@octokit/plugin-paginate-rest',
  '@octokit/plugin-paginate-graphql',
  '@octokit/plugin-request-log',
  '@octokit/types',
  '@octokit/openapi-types',
  'universal-user-agent',
  'before-after-hook',
  'deprecation'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ESM_ONLY_PACKAGES })],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
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
