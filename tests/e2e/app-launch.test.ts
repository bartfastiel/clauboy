/**
 * E2E tests: launch the real built Electron app and verify it works.
 *
 * These tests catch runtime errors (ESM/CJS conflicts, missing modules,
 * renderer crashes) that unit tests cannot detect because they run the
 * actual binary against actual built output.
 *
 * Requires: `npm run build` before running.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

const PROJECT_ROOT = path.join(__dirname, '..', '..')

function makeTempConfigDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clauboy-e2e-'))
}

async function launchApp(tmpConfigDir: string): Promise<ElectronApplication> {
  // On Windows, Playwright's Electron launch requires --no-sandbox and --disable-gpu
  // to avoid a STATUS_BREAKPOINT crash (exit code 2147483651) during headless launch.
  //
  // We use CLAUBOY_CONFIG_DIR instead of redirecting HOME/USERPROFILE — those env vars
  // are used by Electron's own startup and redirecting them crashes the process.
  return electron.launch({
    executablePath: path.join(PROJECT_ROOT, 'node_modules/electron/dist/electron.exe'),
    args: [
      path.join(PROJECT_ROOT, 'out/main/index.js'),
      '--no-sandbox',
      '--disable-gpu'
    ],
    env: {
      ...process.env,
      CLAUBOY_CONFIG_DIR: tmpConfigDir
    }
  })
}

// ─── Launch smoke test ────────────────────────────────────────────────────────

test('app builds and launches without a JavaScript error dialog', async () => {
  const tmpConfigDir = makeTempConfigDir()
  const app = await launchApp(tmpConfigDir)

  try {
    // If the main process crashes (e.g. ERR_REQUIRE_ESM) Electron shows a
    // native error dialog BEFORE any BrowserWindow is created.
    // firstWindow() will time-out in that case, causing the test to fail.
    const window: Page = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // The error dialog has the window title "Error" — a real app window never does.
    const title = await window.title()
    expect(title).not.toBe('Error')
    expect(title.length).toBeGreaterThan(0)
  } finally {
    await app.close()
    fs.rmSync(tmpConfigDir, { recursive: true, force: true })
  }
})

// ─── Onboarding flow ─────────────────────────────────────────────────────────

test.describe('Onboarding wizard', () => {
  let app: ElectronApplication
  let window: Page
  let tmpConfigDir: string

  test.beforeEach(async () => {
    tmpConfigDir = makeTempConfigDir()
    app = await launchApp(tmpConfigDir)
    window = await app.firstWindow()
    await window.waitForLoadState('networkidle')

    // Mock validation IPC handlers so tests can advance without real API calls
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('github:validate-token')
      ipcMain.handle('github:validate-token', () => ({ login: 'testuser', name: 'Test User' }))
      ipcMain.removeHandler('anthropic:validate-key')
      ipcMain.handle('anthropic:validate-key', () => true)
    })
  })

  test.afterEach(async () => {
    await app.close()
    fs.rmSync(tmpConfigDir, { recursive: true, force: true })
  })

  test('shows onboarding on first launch (no config)', async () => {
    // Step 1 title is visible
    await expect(window.getByText('GitHub Personal Access Token').first()).toBeVisible()
  })

  test('step 1 has PAT and API key inputs', async () => {
    await expect(window.locator('input[placeholder*="ghp_"]')).toBeVisible()
    await expect(window.locator('input[placeholder*="sk-ant-"]')).toBeVisible()
  })

  test('Next navigates from step 1 to step 2', async () => {
    await window.fill('input[placeholder*="ghp_"]', 'ghp_test_placeholder')
    await window.click('button:has-text("Next")')
    await expect(window.getByText('Create Bot App Automatically')).toBeVisible()
  })

  test('Back returns from step 2 to step 1', async () => {
    await window.fill('input[placeholder*="ghp_"]', 'ghp_test_placeholder')
    await window.click('button:has-text("Next")')
    await window.click('button:has-text("Back")')
    await expect(window.getByText('GitHub Personal Access Token').first()).toBeVisible()
  })

  test('can reach step 3 (Repository)', async () => {
    // Step 1 → 2
    await window.fill('input[placeholder*="ghp_"]', 'ghp_test_placeholder')
    await window.click('button:has-text("Next")')

    // Step 2 → 3 (GitHub App is optional, skip)
    await window.click('button:has-text("Skip")')
    await expect(window.locator('input[placeholder="your-org"]')).toBeVisible()
  })

  test('repo config fields are present on step 3', async () => {
    await window.fill('input[placeholder*="ghp_"]', 'ghp_test_placeholder')
    await window.click('button:has-text("Next")')
    await window.click('button:has-text("Skip")')

    await expect(window.locator('input[placeholder="your-org"]')).toBeVisible()
    await expect(window.locator('input[placeholder="my-project"]')).toBeVisible()
    await expect(window.locator('input[placeholder="your-github-username"]')).toBeVisible()
  })

  test('step tabs are shown at the top', async () => {
    await expect(window.getByRole('button', { name: 'API Keys' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'GitHub Bot' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Repository' })).toBeVisible()
  })

  test('future step tabs are not clickable in setup', async () => {
    // On step 1, clicking the "Repository" tab (a future step) should not navigate
    await window.click('button[title="Repository"]')
    // Should still show step 1 content
    await expect(window.locator('input[placeholder*="ghp_"]')).toBeVisible()
  })

  test('past step tab navigates back in setup', async () => {
    // Advance to step 2
    await window.fill('input[placeholder*="ghp_"]', 'ghp_test_placeholder')
    await window.click('button:has-text("Next")')
    await expect(window.getByText('Create Bot App Automatically')).toBeVisible()

    // Click the "API Keys" tab (past step) to go back
    await window.click('button[title="API Keys"]')
    await expect(window.locator('input[placeholder*="ghp_"]')).toBeVisible()
  })
})

// ─── Renderer window integrity ────────────────────────────────────────────────

test.describe('Renderer integrity', () => {
  let app: ElectronApplication
  let window: Page
  let tmpConfigDir: string

  test.beforeEach(async () => {
    tmpConfigDir = makeTempConfigDir()
    app = await launchApp(tmpConfigDir)
    window = await app.firstWindow()
    await window.waitForLoadState('networkidle')
  })

  test.afterEach(async () => {
    await app.close()
    fs.rmSync(tmpConfigDir, { recursive: true, force: true })
  })

  test('renderer has no uncaught JavaScript errors', async () => {
    const errors: string[] = []
    window.on('pageerror', (err) => errors.push(err.message))

    // Interact to trigger rendering
    await window.waitForTimeout(500)

    expect(errors).toHaveLength(0)
  })

  test('window.clauboy API is exposed by preload', async () => {
    const api = await window.evaluate(() => Object.keys(window.clauboy))
    expect(api).toContain('getConfig')
    expect(api).toContain('getState')
    expect(api).toContain('checkDocker')
    expect(api).toContain('openAgent')
  })

  test('getConfig() returns a valid config object', async () => {
    const config = await window.evaluate(() => window.clauboy.getConfig())
    expect(config).toHaveProperty('github')
    expect(config).toHaveProperty('docker')
    expect(config).toHaveProperty('buttons')
    expect(Array.isArray(config.buttons)).toBe(true)
    expect(config.buttons.length).toBeGreaterThan(0)
  })

  test('getState() returns a valid AppState', async () => {
    const state = await window.evaluate(() => window.clauboy.getState())
    expect(state).toHaveProperty('isOnboarding')
    expect(state).toHaveProperty('issues')
    expect(Array.isArray(state.issues)).toBe(true)
  })

  test('checkDocker() returns a boolean', async () => {
    const result = await window.evaluate(() => window.clauboy.checkDocker())
    expect(typeof result).toBe('boolean')
  })
})
