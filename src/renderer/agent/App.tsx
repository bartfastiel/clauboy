import React, { useEffect, useState, useRef } from 'react'
import type { AppState, Button, Config, IssueState } from '../../shared/types'
import { useI18n } from '../shared/useI18n'

const LOADING_STEPS = [
  'Connecting to GitHub...',
  'Creating worktree...',
  'Starting container...',
  'Launching Claude Code...'
]

function expandTemplateVars(
  template: string,
  issueState: IssueState
): string {
  return template
    .replace(/\{\{ISSUE_NUMBER\}\}/g, String(issueState.issue.number))
    .replace(/\{\{ISSUE_URL\}\}/g, issueState.issue.html_url)
    .replace(/\{\{WORKTREE_PATH\}\}/g, issueState.worktreePath ?? '')
    // {{ISSUE_TITLE}} and {{ISSUE_BODY}} are intentionally NOT expanded here —
    // injecting untrusted issue content into the Claude session is a prompt-injection risk.
    .replace(/\{\{ISSUE_TITLE\}\}/g, '')
    .replace(/\{\{ISSUE_BODY\}\}/g, '')
}

function ButtonBar({
  buttons,
  onAction,
  disabled
}: {
  buttons: Button[]
  onAction: (btn: Button) => void
  disabled?: boolean
}): React.ReactElement {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(buttons.length)

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const containerWidth = entries[0].contentRect.width
      const btnWidth = 90 // approximate
      const overflowBtnWidth = 40
      const maxVisible = Math.floor((containerWidth - overflowBtnWidth) / btnWidth)
      setVisibleCount(Math.max(1, Math.min(buttons.length, maxVisible)))
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [buttons.length])

  const visibleButtons = buttons.slice(0, visibleCount)
  const overflowButtons = buttons.slice(visibleCount)

  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, overflow: 'hidden', position: 'relative' }}>
      {visibleButtons.map((btn) => (
        <button
          key={btn.id}
          onClick={() => onAction(btn)}
          title={btn.label}
          disabled={disabled}
          style={{ fontSize: '12px', padding: '4px 10px', flexShrink: 0, opacity: disabled ? 0.5 : 1 }}
        >
          <span>{btn.icon}</span>
          <span>{btn.label}</span>
        </button>
      ))}
      {overflowButtons.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn"
            onClick={() => setOverflowOpen(!overflowOpen)}
            style={{ fontSize: '14px', padding: '4px 8px' }}
          >
            •••
          </button>
          {overflowOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '4px',
              zIndex: 100,
              minWidth: '120px',
              boxShadow: '0 4px 12px var(--shadow)'
            }}>
              {overflowButtons.map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => { onAction(btn); setOverflowOpen(false) }}
                  disabled={disabled}
                  style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '2px', fontSize: '12px', opacity: disabled ? 0.5 : 1 }}
                >
                  <span>{btn.icon}</span>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AgentApp(): React.ReactElement {
  const [issueNumber] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return parseInt(params.get('issue') ?? '0', 10)
  })
  const [issueState, setIssueState] = useState<IssueState | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [terminalReady, setTerminalReady] = useState(false)
  const webviewRef = useRef<Electron.WebviewTag>(null)
  const { t } = useI18n()

  useEffect(() => {
    window.clauboy.getConfig().then(setConfig).catch(console.error)
    window.clauboy.getState().then((state: AppState) => {
      const found = state.issues.find((i) => i.issue.number === issueNumber)
      if (found) setIssueState(found)
    }).catch(console.error)

    const unsubscribe = window.clauboy.onStateUpdate((state: AppState) => {
      const found = state.issues.find((i) => i.issue.number === issueNumber)
      if (found) setIssueState(found)
    })
    return unsubscribe
  }, [issueNumber])

  const handleButtonAction = (btn: Button): void => {
    if (!issueState || !config) return

    switch (btn.type) {
      case 'teardown':
        window.clauboy.confirm(t('confirm_teardown')).then((confirmed) => {
          if (confirmed) {
            window.clauboy.teardown(issueNumber).catch(console.error)
          }
        }).catch(console.error)
        break

      case 'pause':
        window.clauboy.pauseAgent(issueNumber).catch(console.error)
        break

      case 'resume':
        window.clauboy.resumeAgent(issueNumber).catch(console.error)
        break

      case 'prompt':
        if (btn.prompt) {
          const expanded = expandTemplateVars(btn.prompt, issueState)
          window.clauboy.injectPrompt(issueNumber, expanded).catch(console.error)
        }
        break

      case 'ide':
        if (issueState.worktreePath) {
          window.clauboy.openInEditor(issueState.worktreePath, btn.command ?? config.editorCommand).catch(console.error)
        }
        break

      case 'web':
        if (btn.url) {
          const url = expandTemplateVars(btn.url, issueState)
          window.clauboy.openExternal(url).catch(console.error)
        }
        break
    }
  }

  const prevRunning = React.useRef(false)
  const isLoading = issueState?.loadingStep !== null && issueState?.loadingStep !== undefined
  const isRunning = issueState?.containerStatus === 'running'

  // Reset terminal loading overlay when container transitions to running
  React.useEffect(() => {
    if (isRunning && !prevRunning.current) setTerminalReady(false)
    prevRunning.current = isRunning
  }, [isRunning])

  // Attach dom-ready via ref — onDomReady prop doesn't work on <webview>
  React.useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return
    const handler = (): void => {
      setTerminalReady(true)
      // Auto-focus so the first keystroke reaches the terminal without an extra click
      wv.focus()
    }
    wv.addEventListener('dom-ready', handler)
    return () => { wv.removeEventListener('dom-ready', handler) }
  }, [isRunning])
  const isPaused = issueState?.clauboyLabels?.includes('clauboy:paused') ?? false
  const agentIsRunning = issueState?.agentIsRunning ?? false

  if (!issueState || !config) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        gap: '8px',
        minHeight: '40px'
      }}>
        <ButtonBar
          buttons={config.buttons}
          onAction={handleButtonAction}
          disabled={agentIsRunning}
        />
        <button
          className="icon-btn"
          onClick={() => window.clauboy.openButtonEditor().catch(console.error)}
          title="Edit action buttons"
          style={{ fontSize: '15px', padding: '3px 6px', flexShrink: 0 }}
        >⋮</button>
        {isRunning && (
          <button
            onClick={() => window.clauboy.pauseAgent(issueNumber).catch(console.error)}
            title="Pause agent (stop container, keep worktree)"
            style={{ fontSize: '11px', padding: '3px 8px', flexShrink: 0 }}
          >
            ⏸
          </button>
        )}
        {isPaused && (
          <button
            onClick={() => window.clauboy.resumeAgent(issueNumber).catch(console.error)}
            title="Resume agent"
            style={{ fontSize: '11px', padding: '3px 8px', flexShrink: 0 }}
          >
            ▶ Resume
          </button>
        )}
        {isRunning && (
          <button
            onClick={() => window.clauboy.openAuthTerminal(issueNumber).catch(console.error)}
            title="Open terminal to run claude auth login"
            style={{ fontSize: '11px', padding: '3px 8px', flexShrink: 0, opacity: 0.7 }}
          >
            🔑 Auth
          </button>
        )}
        {isRunning && (
          <button
            className="icon-btn"
            onClick={() => window.clauboy.openExternal(`http://localhost:${issueState.terminalPort ?? (37680 + issueNumber)}`).catch(console.error)}
            title="Open terminal in browser"
            style={{ fontSize: '14px', padding: '3px 6px', flexShrink: 0 }}
          >
            🌐
          </button>
        )}
        {agentIsRunning && (
          <span style={{ fontSize: '11px', color: 'var(--accent)', flexShrink: 0, animation: 'pulse 1s infinite' }}>
            ⟳ thinking…
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px'
        }}>
          <div style={{ fontSize: '32px' }}>🤠</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '260px' }}>
            {LOADING_STEPS.map((step, i) => {
              const currentIdx = LOADING_STEPS.indexOf(issueState.loadingStep ?? '')
              const isDone = i < currentIdx
              const isCurrent = i === currentIdx || (currentIdx === -1 && i === 0)
              return (
                <div key={step} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: isDone ? 'var(--accent-success)' : isCurrent ? 'var(--text)' : 'var(--text-muted)'
                }}>
                  <span>{isDone ? '✓' : isCurrent ? '⟳' : '○'}</span>
                  <span style={{ fontSize: '13px' }}>{step}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : isRunning ? (
        <>
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {!terminalReady && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '12px',
                background: 'var(--bg)', zIndex: 1
              }}>
                <span style={{ fontSize: '28px', animation: 'spin 1s linear infinite' }}>⟳</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Connecting to terminal…</span>
              </div>
            )}
            <webview
              ref={webviewRef}
              src={`http://localhost:${issueState.terminalPort ?? (37680 + issueNumber)}`}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </>
      ) : issueState.containerStatus === 'error' ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px'
        }}>
          <span style={{ fontSize: '32px' }}>⚠️</span>
          <span style={{ color: 'var(--accent-danger)', fontWeight: 600 }}>Failed to start agent</span>
          {issueState.errorMessage && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '10px 14px',
              fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)',
              maxWidth: '100%', wordBreak: 'break-word', whiteSpace: 'pre-wrap'
            }}>
              {issueState.errorMessage}
            </div>
          )}
          <button
            className="primary"
            onClick={() => window.clauboy.retryAgent(issueNumber).catch(console.error)}
          >
            ↺ Retry
          </button>
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '12px', color: 'var(--text-secondary)'
        }}>
          <span style={{ fontSize: '32px' }}>💤</span>
          <span>{t('container_not_running')}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status: {issueState.containerStatus}</span>
        </div>
      )}
    </div>
  )
}
