/**
 * Feedback-loop test: launch the app, open agent window for issue #1,
 * take screenshots, and verify terminal input works.
 */
import { _electron as electron } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, 'test-results', 'agent-terminal-test')
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function screenshot(page, name) {
  const file = path.join(SCREENSHOTS_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`  📸 ${name}.png`)
}

console.log('🚀 Launching Clauboy...')
const app = await electron.launch({
  executablePath: path.join(PROJECT_ROOT, 'node_modules/electron/dist/electron.exe'),
  args: [path.join(PROJECT_ROOT, 'out/main/index.js'), '--no-sandbox', '--disable-gpu'],
  env: { ...process.env }
})

const dashboard = await app.firstWindow()
await dashboard.waitForLoadState('networkidle')
await sleep(2000)
await screenshot(dashboard, '01-dashboard')

// Wait for startup sync to populate issues (poll up to 30s)
console.log('  Waiting for startup sync...')
let state = null
for (let i = 0; i < 30; i++) {
  state = await dashboard.evaluate(() => window.clauboy.getState())
  if (state?.issues?.length > 0) break
  await sleep(1000)
  process.stdout.write('.')
}
console.log(`\n  Issues in state: ${state?.issues?.length ?? 0}`)
if (state?.issues?.length > 0) {
  console.log('  Issues:', state.issues.map(i => `#${i.issue.number} ${i.containerStatus}`).join(', '))
}

// Directly open the agent window for issue 1 (container is already running)
console.log('  Opening agent window for issue #1...')
await dashboard.evaluate(() => window.clauboy.openAgent(1))
await sleep(3000)

// Find the agent window
const windows = app.windows()
console.log(`  Windows: ${windows.length}`)

let agentWin = null
for (const w of windows) {
  const title = await w.title().catch(() => '')
  console.log(`    - "${title}"`)
  if (w !== dashboard) agentWin = w
}

if (!agentWin) {
  console.log('  ❌ No agent window opened')
  await screenshot(dashboard, '02-no-agent-window')
  await app.close()
  process.exit(1)
}

await agentWin.waitForLoadState('networkidle')
await sleep(3000) // wait for terminal to connect and render
await screenshot(agentWin, '02-agent-window-initial')

const initialText = await agentWin.evaluate(() => document.body.innerText)
console.log('\n  Terminal content (initial):', initialText.slice(0, 400).replace(/\n/g, '↵'))

// Check if the theme wizard is showing
const hasThemeWizard = initialText.includes('Choose the text style') || initialText.includes('Dark mode')
console.log(`  Theme wizard showing: ${hasThemeWizard}`)
if (hasThemeWizard) {
  console.log('  ❌ FAIL: Claude still showing first-run theme wizard!')
} else {
  console.log('  ✅ OK: No theme wizard (or terminal not yet loaded)')
}

// Send '1' to pick dark mode (if wizard shows) OR just type something to test input
console.log('\n  Sending "hello\\n" to test terminal input...')
await agentWin.evaluate(() => window.clauboy.sendTerminalInput(1, 'hello\n'))
await sleep(3000)
await screenshot(agentWin, '03-after-input')

const afterText = await agentWin.evaluate(() => document.body.innerText)
console.log('  Terminal content (after input):', afterText.slice(0, 400).replace(/\n/g, '↵'))

const inputEchoed = afterText !== initialText
console.log(`  Terminal changed after input: ${inputEchoed}`)
if (inputEchoed) {
  console.log('  ✅ OK: Terminal input is working!')
} else {
  console.log('  ❌ FAIL: Terminal did not respond to input')
}

console.log('\nDone. Closing app...')
await app.close()
