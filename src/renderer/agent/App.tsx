import React, { useEffect, useState, useRef, useCallback } from 'react'
import type { AppState, Button, Config, IssueState, LogEntry } from '../../shared/types'
import { useI18n } from '../shared/useI18n'

const LOG_COLORS: Record<string, string> = {
  info: 'var(--text-secondary)',
  debug: 'var(--text-muted)',
  warn: '#e3b341',
  error: '#f85149'
}

function LogPanel(): React.ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [open, setOpen] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.clauboy.onLogData((entry: LogEntry) => {
      setLogs((prev) => [...prev.slice(-499), entry])
    })
    return unsub
  }, [])

  useEffect(() => {
    if (open && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, open])

  return (
    <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-tertiary)' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 8px', cursor: 'pointer', userSelect: 'none',
          fontSize: '11px', color: 'var(--text-muted)'
        }}
      >
        <span>System Logs ({logs.length})</span>
        <span>{open ? '▼' : '▶'}</span>
      </div>
      {open && (
        <div
          ref={logRef}
          style={{
            height: '140px', overflowY: 'auto', padding: '4px 8px',
            fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5'
          }}
        >
          {logs.length === 0 && (
            <span style={{ color: 'var(--text-muted)' }}>Waiting for logs…</span>
          )}
          {logs.map((entry, i) => (
            <div key={i} style={{ color: LOG_COLORS[entry.level] ?? 'inherit', wordBreak: 'break-all' }}>
              <span style={{ opacity: 0.6 }}>{entry.ts.slice(11, 19)} </span>
              <span style={{ fontWeight: entry.level === 'error' ? 700 : 400 }}>[{entry.level.toUpperCase()}] </span>
              {entry.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
    .replace(/\{\{ISSUE_TITLE\}\}/g, issueState.issue.title)
    .replace(/\{\{ISSUE_URL\}\}/g, issueState.issue.html_url)
    .replace(/\{\{ISSUE_BODY\}\}/g, issueState.issue.body ?? '')
    .replace(/\{\{WORKTREE_PATH\}\}/g, issueState.worktreePath ?? '')
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
  const [customPrompt, setCustomPrompt] = useState('')
  const customPromptRef = useRef<HTMLInputElement>(null)
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

  const sendCustomPrompt = useCallback(() => {
    if (!customPrompt.trim()) return
    window.clauboy.injectPrompt(issueNumber, customPrompt.trim()).catch(console.error)
    setCustomPrompt('')
  }, [customPrompt, issueNumber])

  const isLoading = issueState?.loadingStep !== null && issueState?.loadingStep !== undefined
  const isRunning = issueState?.containerStatus === 'running'
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
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flexShrink: 0 }}>
          #{issueState.issue.number}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
          {issueState.issue.title}
        </span>
        <ButtonBar
          buttons={config.buttons}
          onAction={handleButtonAction}
          disabled={agentIsRunning}
        />
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
          <webview
            src={`http://localhost:${issueState.terminalPort ?? (37680 + issueNumber)}`}
            style={{ flex: 1, width: '100%', minHeight: 0 }}
          />
          <div style={{
            display: 'flex',
            gap: '6px',
            padding: '6px 8px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            flexShrink: 0
          }}>
            <input
              ref={customPromptRef}
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendCustomPrompt() }}
              placeholder="Inject prompt… (Enter to send)"
              style={{ flex: 1, fontSize: '12px', padding: '4px 8px' }}
            />
            <button
              onClick={sendCustomPrompt}
              style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0 }}
            >
              Send
            </button>
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
      <LogPanel />
    </div>
  )
}
