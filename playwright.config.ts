import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'electron',
      testMatch: 'app-*.test.ts'
    },
    {
      name: 'docker',
      testMatch: 'docker-*.test.ts',
      timeout: 300_000 // docker build can take a while
    }
  ]
})
