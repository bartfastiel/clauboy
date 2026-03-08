import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'

const skip = /\.(png|jpg|ico|exe|dll)$|package-lock\.json/
const files = execSync('git ls-files').toString().trim().split('\n')
  .filter(f => f && !skip.test(f))

const missing = []
for (const f of files) {
  if (!existsSync(f)) continue
  const b = readFileSync(f)
  if (b.length > 0 && b[b.length - 1] !== 10) missing.push(f)
}

if (missing.length === 0) {
  console.log('All files end with \\n')
} else {
  console.log('Missing trailing newline:')
  missing.forEach(f => console.log(' ', f))
}
