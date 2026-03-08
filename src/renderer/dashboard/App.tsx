import React, { useEffect, useState } from 'react'
import { AppState, IssueState, ClauboyLabel } from '../../shared/types'
import { useI18n } from '../shared/useI18n'

function getLabelBadge(labels: ClauboyLabel[]): { text: string; className: string } {
  if (labels.includes('clauboy:running')) return { text: 'Running', className: 'badge badge-running' }
  if (labels.includes('clauboy:done')) return { text: 'Done', className: 'badge badge-done' }
  if (labels.includes('clauboy:paused')) return { text: 'Paused', className: 'badge badge-paused' }
  if (labels.includes('clauboy:error')) return { text: 'Error', className: 'badge badge-error' }
  if (labels.includes('clauboy')) return { text: 'Queued', className: 'badge badge-queued' }
  return { text: 'Unknown', className: 'badge' }
}

function IssueRow({ issueState, onClick }: { issueState: IssueState; onClick: () => void }): React.ReactElement {
  const badge = getLabelBadge(issueState.clauboyLabels)
  const containerIcon = issueState.containerStatus === 'running' ? '🟢' : issueState.containerStatus === 'error' ? '🔴' : '⚪'

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        transition: 'background 0.1s'
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: '12px' }}>{containerIcon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>#{issueState.issue.number}</span>
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {issueState.issue.title}
          </span>
        </div>
        {issueState.loadingStep && (
          <div style={{ fontSize: '11px', color: 'var(--accent)' }}>{issueState.loadingStep}</div>
        )}
      </div>
      <span className={badge.className}>{badge.text}</span>
    </div>
  )
}

export default function DashboardApp(): React.ReactElement {
  const [appState, setAppState] = useState<AppState | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    window.clauboy.getState().then(setAppState).catch(console.error)
    const unsubscribe = window.clauboy.onStateUpdate(setAppState)
    return unsubscribe
  }, [])

  const handleOpenAgent = (issueNumber: number): void => {
    window.clauboy.openAgent(issueNumber).catch(console.error)
  }

  const handleNewIssue = (): void => {
    window.clauboy.createIssueUrl().catch(console.error)
  }

  const handleForceSync = (): void => {
    window.clauboy.forceSync().catch(console.error)
  }

  const handleCleanupOrphan = (worktreePath: string): void => {
    window.clauboy.confirm(`Remove orphan worktree?\n${worktreePath}`).then((confirmed) => {
      if (confirmed) {
        // TODO: implement orphan removal IPC
        console.log('Remove orphan:', worktreePath)
      }
    }).catch(console.error)
  }

  if (!appState) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    )
  }

  const sortedIssues = [...appState.issues].sort(
    (a, b) => new Date(b.issue.created_at).getTime() - new Date(a.issue.created_at).getTime()
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        gap: '8px',
        background: 'var(--bg-secondary)'
      }}>
        <span style={{ fontWeight: 700, fontSize: '15px', flex: 1 }}>🤠 Clauboy</span>
        {appState.isSyncing && (
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Syncing...</span>
        )}
        <button className="icon-btn" onClick={handleForceSync} title={t('sync')}>↺</button>
        <button className="icon-btn" onClick={() => window.clauboy.openSettings().catch(console.error)} title={t('settings')}>⚙</button>
      </div>

      {/* Orphan warnings */}
      {appState.orphanWorktrees.length > 0 && (
        <div style={{
          padding: '8px 16px',
          background: 'rgba(255, 167, 38, 0.1)',
          borderBottom: '1px solid rgba(255, 167, 38, 0.3)'
        }}>
          {appState.orphanWorktrees.map((wtPath) => (
            <div key={wtPath} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <span>⚠️ Orphan worktree:</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>{wtPath}</span>
              <button style={{ fontSize: '11px', padding: '2px 8px' }} onClick={() => handleCleanupOrphan(wtPath)}>
                {t('cleanup')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Issue list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sortedIssues.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '12px',
            color: 'var(--text-secondary)'
          }}>
            <span style={{ fontSize: '32px' }}>🤠</span>
            <span>{t('no_issues')}</span>
            <button className="primary" onClick={handleNewIssue}>
              {t('new_issue')}
            </button>
          </div>
        ) : (
          sortedIssues.map((issueState) => (
            <IssueRow
              key={issueState.issue.number}
              issueState={issueState}
              onClick={() => handleOpenAgent(issueState.issue.number)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--bg-secondary)'
      }}>
        <button onClick={handleNewIssue} style={{ fontSize: '12px', padding: '4px 10px' }}>
          + {t('new_issue')}
        </button>
        <span style={{ flex: 1 }} />
        {appState.lastSyncAt && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {t('last_sync')}: {new Date(appState.lastSyncAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}
