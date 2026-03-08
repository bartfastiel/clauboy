import React, { useEffect, useState, useRef } from 'react'
import { AppState, Button, Config, IssueState } from '../../shared/types'
import { useI18n } from '../shared/useI18n'
import TerminalComponent from './Terminal'

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
  issueState,
  config,
  onAction
}: {
  buttons: Button[]
  issueState: IssueState
  config: Config
  onAction: (btn: Button) => void
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
          style={{ fontSize: '12px', padding: '4px 10px', flexShrink: 0 }}
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
                  style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '2px', fontSize: '12px' }}
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

  const isLoading = issueState?.loadingStep !== null && issueState?.loadingStep !== undefined
  const isRunning = issueState?.containerStatus === 'running'

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
          issueState={issueState}
          config={config}
          onAction={handleButtonAction}
        />
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
        <TerminalComponent issueNumber={issueNumber} />
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: 'var(--text-secondary)'
        }}>
          <span style={{ fontSize: '32px' }}>💤</span>
          <span>{t('container_not_running')}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Status: {issueState.containerStatus}
          </span>
        </div>
      )}
    </div>
  )
}
