import React, { useEffect, useState, useRef } from 'react'
import type { AppState, Button, Config, IssueState } from '../../shared/types'
import { useI18n } from '../shared/useI18n'

const LOADING_STEPS = [
  'Connecting to GitHub...',
  'Pulling image...',
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
    // {{ISSUE_TITLE}} and {{ISSUE_BODY}} are intentionally NOT expanded here —
    // injecting untrusted issue content into the Claude session is a prompt-injection risk.
    .replace(/\{\{ISSUE_TITLE\}\}/g, '')
    .replace(/\{\{ISSUE_BODY\}\}/g, '')
}

function ButtonBar({
  buttons,
  onAction,
  disabled,
  onEdit
}: {
  buttons: Button[]
  onAction: (btn: Button) => void
  disabled?: boolean
  onEdit?: () => void
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
      {onEdit && (
        <button
          className="icon-btn"
          onClick={onEdit}
          title="Edit action buttons"
          style={{ fontSize: '15px', padding: '3px 6px', flexShrink: 0 }}
        >⋮</button>
      )}
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

function ContainerLogs({ issueNumber, containerStatus }: { issueNumber: number; containerStatus: string }): React.ReactElement {
  const [logs, setLogs] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const fetchLogs = (): void => {
      window.clauboy.getContainerLogs(issueNumber)
        .then((text) => { if (!cancelled) { setLogs(text || null); setLoading(false) } })
        .catch(() => { if (!cancelled) { setLogs(null); setLoading(false) } })
    }
    fetchLogs()
    const interval = setInterval(fetchLogs, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [issueNumber, containerStatus])

  useEffect(() => {
    logEndRef.current?.scrollIntoView()
  }, [logs])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        Fetching container logs…
      </div>
    )
  }

  if (!logs) {
    const isRunningContainer = containerStatus === 'running'
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '8px', color: 'var(--text-secondary)'
      }}>
        {isRunningContainer ? (
          <>
            <span>Container is running but has no logs yet.</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              The agent image may be misconfigured — check Settings → Docker.
            </span>
          </>
        ) : (
          <>
            <span>No container found for this issue.</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Add the <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>clauboy</code> label to start an agent.
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0
    }}>
      <div style={{
        padding: '6px 12px', fontSize: '11px', color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)', flexShrink: 0
      }}>
        Container logs (status: {containerStatus})
      </div>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 12px',
        fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5',
        color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
      }}>
        {logs}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}

function PromptInput({ issueNumber }: { issueNumber: number }): React.ReactElement {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSend = (): void => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    window.clauboy.injectPrompt(issueNumber, trimmed)
      .then(() => setText(''))
      .catch(console.error)
      .finally(() => setSending(false))
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '6px 12px', borderTop: '1px solid var(--border)',
      background: 'var(--bg-secondary)'
    }}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
        placeholder="Send to terminal…"
        disabled={sending}
        style={{
          flex: 1, fontSize: '12px', padding: '5px 8px',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', color: 'var(--text)',
          outline: 'none'
        }}
      />
      <button
        onClick={handleSend}
        disabled={!text.trim() || sending}
        style={{ fontSize: '12px', padding: '4px 10px', opacity: text.trim() ? 1 : 0.4 }}
      >
        Send
      </button>
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
  const [webviewFailed, setWebviewFailed] = useState(false)
  const webviewRef = useRef<Electron.WebviewTag>(null)
  const { t } = useI18n()

  useEffect(() => {
    window.clauboy.getConfig().then(setConfig).catch(console.error)
    const unsubConfig = window.clauboy.onConfigUpdate(setConfig)
    window.clauboy.getState().then((state: AppState) => {
      const found = state.issues.find((i) => i.issue.number === issueNumber)
      if (found) setIssueState(found)
    }).catch(console.error)

    const unsubscribe = window.clauboy.onStateUpdate((state: AppState) => {
      const found = state.issues.find((i) => i.issue.number === issueNumber)
      if (found) setIssueState(found)
    })
    return () => { unsubscribe(); unsubConfig() }
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

      case 'prompt':
        if (btn.prompt) {
          const expanded = expandTemplateVars(btn.prompt, issueState)
          window.clauboy.injectPrompt(issueNumber, expanded).catch(console.error)
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
    if (isRunning && !prevRunning.current) {
      setTerminalReady(false)
      setWebviewFailed(false)
      terminalConnected.current = false
    }
    prevRunning.current = isRunning
  }, [isRunning])

  // Track whether the terminal has ever connected successfully
  const terminalConnected = React.useRef(false)

  // Attach dom-ready via ref — onDomReady prop doesn't work on <webview>
  React.useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return
    const onDomReady = (): void => {
      // Hide content inside the webview while xterm.js initializes and resizes
      wv.insertCSS(`
        ::-webkit-scrollbar { display: none !important; }
        body, html { overflow: hidden !important; }
        body { opacity: 0; }
      `).catch(() => {})
    }
    const onDidStopLoading = (): void => {
      // Check if the webview actually loaded ttyd (not an error page)
      wv.executeJavaScript('!!document.querySelector(".xterm")')
        .then((hasXterm: boolean) => {
          if (hasXterm) {
            terminalConnected.current = true
            setWebviewFailed(false)
            setTimeout(() => {
              wv.insertCSS('body { opacity: 1 !important; }').catch(() => {})
              setTerminalReady(true)
            }, 400)
            setTimeout(() => wv.focus(), 700)
          } else {
            // Page loaded but no terminal — ttyd not ready yet
            setWebviewFailed(true)
          }
        })
        .catch(() => setWebviewFailed(true))
    }
    const onDidFailLoad = (_e: Event): void => {
      setWebviewFailed(true)
    }
    wv.addEventListener('dom-ready', onDomReady)
    wv.addEventListener('did-stop-loading', onDidStopLoading)
    wv.addEventListener('did-fail-load', onDidFailLoad)
    return () => {
      wv.removeEventListener('dom-ready', onDomReady)
      wv.removeEventListener('did-stop-loading', onDidStopLoading)
      wv.removeEventListener('did-fail-load', onDidFailLoad)
    }
  }, [isRunning])

  // Auto-retry: reload the webview every 5s if terminal hasn't connected
  React.useEffect(() => {
    if (!isRunning || !webviewFailed || terminalConnected.current) return
    const interval = setInterval(() => {
      const wv = webviewRef.current
      if (wv) {
        setTerminalReady(false)
        wv.reload()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [isRunning, webviewFailed])
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
          onEdit={() => window.clauboy.openButtonEditor().catch(console.error)}
        />
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
          <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
            {/* Webview is ALWAYS mounted when running — hidden via CSS when failed, so reload() works */}
            <webview
              ref={webviewRef}
              src={`http://localhost:${issueState.terminalPort ?? (37680 + issueNumber)}`}
              style={{
                width: '100%', height: '100%',
                display: webviewFailed ? 'none' : 'flex'
              }}
            />
            {/* Loading overlay while terminal initializes */}
            {!webviewFailed && !terminalReady && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '12px',
                background: 'var(--bg)', zIndex: 1, pointerEvents: 'none'
              }}>
                <span style={{ fontSize: '28px', animation: 'spin 1s linear infinite' }}>⟳</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Connecting to terminal…</span>
              </div>
            )}
            {/* Container logs shown when terminal is not reachable */}
            {webviewFailed && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{
                  padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0
                }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>⟳</span>
                  <span>Waiting for terminal on port {issueState.terminalPort ?? (37680 + issueNumber)}…</span>
                  <button
                    onClick={() => window.clauboy.openExternal(`http://localhost:${issueState.terminalPort ?? (37680 + issueNumber)}`).catch(console.error)}
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    Open in browser
                  </button>
                </div>
                <ContainerLogs issueNumber={issueNumber} containerStatus={issueState.containerStatus} />
              </div>
            )}
          </div>
          <PromptInput issueNumber={issueNumber} />
        </>
      ) : issueState.containerStatus === 'error' ? (
        <>
          <div style={{
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px',
            borderBottom: '1px solid var(--border)', flexShrink: 0
          }}>
            <span style={{ color: 'var(--accent-danger)', fontWeight: 600, fontSize: '13px' }}>Failed to start agent</span>
            {issueState.errorMessage && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {issueState.errorMessage}
              </span>
            )}
            <button
              className="primary"
              onClick={() => window.clauboy.retryAgent(issueNumber).catch(console.error)}
              style={{ fontSize: '12px', padding: '4px 10px', flexShrink: 0 }}
            >
              ↺ Retry
            </button>
          </div>
          <ContainerLogs issueNumber={issueNumber} containerStatus={issueState.containerStatus} />
        </>
      ) : (
        <ContainerLogs issueNumber={issueNumber} containerStatus={issueState.containerStatus} />
      )}
    </div>
  )
}
