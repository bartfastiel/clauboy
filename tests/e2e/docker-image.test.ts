/**
 * E2E tests: build and run the agent Docker image.
 *
 * These tests verify that the Dockerfile in resources/ produces a working
 * image with all required tools (Claude Code, GitHub CLI, git, node).
 *
 * Requires: Docker Desktop running.
 * Timeout: 5 minutes (docker build pulls layers on first run).
 */
import { test, expect } from '@playwright/test'
import { execSync, execFileSync } from 'child_process'
import * as path from 'path'

const PROJECT_ROOT = path.join(__dirname, '..', '..')
const DOCKERFILE = path.join(PROJECT_ROOT, 'resources', 'Dockerfile')
const TEST_IMAGE = 'clauboy-agent-e2e-test'

function docker(args: string[], opts?: { timeout?: number }): string {
  return execFileSync('docker', args, {
    cwd: PROJECT_ROOT,
    timeout: opts?.timeout ?? 30_000,
    encoding: 'utf-8'
  })
}

// ─── Prerequisites ────────────────────────────────────────────────────────────

test('Docker daemon is reachable', async () => {
  const output = docker(['info', '--format', '{{.ServerVersion}}'])
  expect(output.trim().length).toBeGreaterThan(0)
})

// ─── Image build ─────────────────────────────────────────────────────────────

test('Dockerfile builds without errors', async () => {
  // Build the image; if docker build exits non-zero it throws
  docker(
    ['build', '-t', TEST_IMAGE, '-f', DOCKERFILE, path.dirname(DOCKERFILE)],
    { timeout: 300_000 }
  )
  // Verify image exists
  const images = docker(['images', '-q', TEST_IMAGE])
  expect(images.trim().length).toBeGreaterThan(0)
})

// ─── Container tool checks ────────────────────────────────────────────────────
// All tests below require the image to exist — they run after the build test.

test('node is available in agent container', async () => {
  const output = docker(['run', '--rm', TEST_IMAGE, 'node', '--version'])
  expect(output.trim()).toMatch(/^v\d+/)
})

test('git is available in agent container', async () => {
  const output = docker(['run', '--rm', TEST_IMAGE, 'git', '--version'])
  expect(output).toContain('git version')
})

test('GitHub CLI (gh) is available in agent container', async () => {
  const output = docker(['run', '--rm', TEST_IMAGE, 'gh', '--version'])
  expect(output).toContain('gh version')
})

test('claude command is available in agent container', async () => {
  // claude --version or claude --help should exit 0 and print something
  const output = docker(['run', '--rm', TEST_IMAGE, 'claude', '--version'])
  expect(output.trim().length).toBeGreaterThan(0)
})

test('npm is available in agent container', async () => {
  const output = docker(['run', '--rm', TEST_IMAGE, 'npm', '--version'])
  expect(output.trim()).toMatch(/^\d+\.\d+/)
})

// ─── Container behaviour ──────────────────────────────────────────────────────

test('container starts with /workspace as working directory', async () => {
  const output = docker(['run', '--rm', '--entrypoint', 'pwd', TEST_IMAGE])
  expect(output.trim()).toBe('/workspace')
})

test('git safe.directory is configured for /workspace', async () => {
  const output = docker([
    'run', '--rm', TEST_IMAGE,
    'git', 'config', '--global', 'safe.directory'
  ])
  expect(output).toContain('/workspace')
})

test('container exits cleanly when given --help flag', async () => {
  // Validates CMD entrypoint syntax — if CMD is malformed docker run fails immediately
  const output = docker(['run', '--rm', TEST_IMAGE, 'claude', '--help'])
  expect(output.trim().length).toBeGreaterThan(0)
})

// ─── Cleanup ──────────────────────────────────────────────────────────────────

test.afterAll(() => {
  try {
    execSync(`docker rmi ${TEST_IMAGE}`, { stdio: 'ignore' })
  } catch {
    // Best-effort cleanup
  }
})
