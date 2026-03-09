import React, { useEffect, useState } from 'react'
import { AppState, IssueState, ClauboyLabel, GitHubIssue } from '../../shared/types'
import { VERSION } from '../../shared/version'
import { useI18n } from '../shared/useI18n'

function getLabelBadge(labels: ClauboyLabel[]): { text: string; className: string } {
  if (labels.includes('clauboy:running')) return { text: 'Running', className: 'badge badge-running' }
  if (labels.includes('clauboy:done')) return { text: 'Done', className: 'badge badge-done' }
  if (labels.includes('clauboy:paused')) return { text: 'Paused', className: 'badge badge-paused' }
  if (labels.includes('clauboy:error')) return { text: 'Error', className: 'badge badge-error' }
  if (labels.includes('clauboy')) return { text: 'Queued', className: 'badge badge-queued' }
  return { text: 'Unknown', className: 'badge' }
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function IssueRow({ issueState, onClick }: { issueState: IssueState; onClick: () => void }): React.ReactElement {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (issueState.containerStatus !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [issueState.containerStatus])

  const elapsed = issueState.agentElapsedSeconds !== null && issueState.agentElapsedCapturedAt
    ? issueState.agentElapsedSeconds + Math.floor((now - new Date(issueState.agentElapsedCapturedAt).getTime()) / 1000)
    : null

  const badge = getLabelBadge(issueState.clauboyLabels)
  const containerIcon = issueState.containerStatus === 'running'
    ? (issueState.agentActivity === 'waiting' ? '🟡' : issueState.agentActivity === 'working' ? '🟢' : '🟢')
    : issueState.containerStatus === 'error' ? '🔴' : '⚪'
  const activityTitle = issueState.containerStatus === 'running'
    ? (issueState.agentActivity === 'waiting' ? 'Waiting for input' : issueState.agentActivity === 'working' ? 'Working…' : 'Running')
    : issueState.containerStatus

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'background 0.1s'
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: '12px' }} title={activityTitle}>{containerIcon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>#{issueState.issue.number}</span>
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {issueState.issue.title}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
          {issueState.issue.labels.map((label) => (
            <span key={label.name} style={{
              fontSize: '10px', padding: '1px 6px', borderRadius: '10px',
              background: `#${label.color}33`, color: `#${label.color}`,
              border: `1px solid #${label.color}66`
            }}>{label.name}</span>
          ))}
        </div>
        {issueState.loadingStep && (
          <div style={{ fontSize: '11px', color: 'var(--accent)' }}>{issueState.loadingStep}</div>
        )}
        {!issueState.loadingStep && issueState.containerStatus === 'running' && issueState.agentActivity && (
          <div style={{ fontSize: '11px', color: issueState.agentActivity === 'waiting' ? 'var(--text-muted)' : 'var(--accent)' }}>
            {issueState.agentActivity === 'waiting' ? '⏸ Waiting for input' : '⚙ Working…'}
            {elapsed !== null && <span style={{ marginLeft: '6px', opacity: 0.7 }}>{formatElapsed(elapsed)}</span>}
          </div>
        )}
      </div>
      <span className={badge.className}>{badge.text}</span>
      <button
        className="icon-btn"
        title="Open issue on GitHub"
        style={{ fontSize: '13px', flexShrink: 0 }}
        onClick={(e) => { e.stopPropagation(); window.clauboy.openExternal(issueState.issue.html_url).catch(console.error) }}
      >↗</button>
    </div>
  )
}

function AllIssueRow({
  issue, isClauboy, onStart, starting,
}: {
  issue: GitHubIssue; isClauboy: boolean; onStart: () => void; starting: boolean
}): React.ReactElement {
  return (
    <div style={{
      padding: '10px 16px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>#{issue.number} </span>
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
            {issue.title}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
          {issue.labels.map((label) => (
            <span key={label.name} style={{
              fontSize: '10px', padding: '1px 6px', borderRadius: '10px',
              background: `#${label.color}33`, color: `#${label.color}`,
              border: `1px solid #${label.color}66`
            }}>{label.name}</span>
          ))}
        </div>
      </div>
      <button
        className="icon-btn"
        title="Open issue on GitHub"
        style={{ fontSize: '13px', flexShrink: 0 }}
        onClick={(e) => { e.stopPropagation(); window.clauboy.openExternal(issue.html_url).catch(console.error) }}
      >↗</button>
      {isClauboy
        ? <span className="badge badge-queued" style={{ fontSize: '10px' }}>Queued</span>
        : <button style={{ fontSize: '11px', padding: '3px 10px', whiteSpace: 'nowrap' }} disabled={starting} onClick={(e) => { e.stopPropagation(); onStart() }}>
            {starting ? '…' : '▶ Start'}
          </button>
      }
    </div>
  )
}

function matchesFilter(title: string, number: number, filter: string): boolean {
  const q = filter.trim().toLowerCase()
  if (!q) return true
  return title.toLowerCase().includes(q) || String(number).includes(q)
}

export default function DashboardApp(): React.ReactElement {
  const [appState, setAppState] = useState<AppState | null>(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [allIssues, setAllIssues] = useState<GitHubIssue[] | null>(null)
  const [allLoading, setAllLoading] = useState(false)
  const [startingIssue, setStartingIssue] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const { t } = useI18n()

  useEffect(() => {
    window.clauboy.getState().then(setAppState).catch(console.error)
    return window.clauboy.onStateUpdate(setAppState)
  }, [])

  // Auto-open browse when there are no clauboy issues
  useEffect(() => {
    if (appState && appState.issues.length === 0) setBrowseOpen(true)
  }, [appState?.issues.length === 0])

  const loadAllIssues = (): void => {
    setAllLoading(true)
    window.clauboy.listAllIssues()
      .then(setAllIssues)
      .catch(console.error)
      .finally(() => setAllLoading(false))
  }

  useEffect(() => {
    if (browseOpen && allIssues === null) loadAllIssues()
  }, [browseOpen])

  const handleStartIssue = async (issueNumber: number): Promise<void> => {
    setStartingIssue(issueNumber)
    try {
      await window.clauboy.labelIssue(issueNumber)
      setBrowseOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setStartingIssue(null)
    }
  }

  const handleForceSync = (): void => {
    window.clauboy.forceSync().catch(console.error)
    if (browseOpen) { setAllIssues(null); loadAllIssues() }
  }

  const handleCleanupOrphan = (worktreePath: string): void => {
    window.clauboy.confirm(`Remove orphan worktree?\n${worktreePath}`)
      .then((confirmed) => {
        if (confirmed) window.clauboy.cleanupOrphan(worktreePath).catch(console.error)
      })
      .catch(console.error)
  }

  if (!appState) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>Loading...</div>
  }

  const clauboyIssueNumbers = new Set(appState.issues.map((i) => i.issue.number))
  const sortedIssues = [...appState.issues]
    .sort((a, b) => new Date(b.issue.updated_at).getTime() - new Date(a.issue.updated_at).getTime())
    .filter((s) => matchesFilter(s.issue.title, s.issue.number, filter))
  const filteredAllIssues = allIssues?.filter((i) => matchesFilter(i.title, i.number, filter)) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', gap: '8px', background: 'var(--bg-secondary)' }}>
        <span style={{ fontWeight: 700, fontSize: '15px' }}>🤠</span>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter issues…"
          style={{
            flex: 1, fontSize: '12px', padding: '3px 8px',
            ...(filter.trim() ? {
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              outline: '2px solid var(--accent)',
              borderColor: 'var(--accent)'
            } : {})
          }}
        />
        {appState.isSyncing && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>⟳</span>}
        <button
          className="icon-btn"
          style={{ fontWeight: browseOpen ? 700 : 400 }}
          onClick={() => setBrowseOpen((v) => !v)}
          title="Browse all issues"
        >📋</button>
        <button className="icon-btn" onClick={handleForceSync} title={t('sync')}>↺</button>
        <button className="icon-btn" onClick={() => window.clauboy.openSettings().catch(console.error)} title={t('settings')}>⚙</button>
      </div>

      {/* Orphan warnings */}
      {appState.orphanWorktrees.length > 0 && (
        <div style={{ padding: '8px 16px', background: 'rgba(255,167,38,0.1)', borderBottom: '1px solid rgba(255,167,38,0.3)' }}>
          {appState.orphanWorktrees.map((wtPath) => (
            <div key={wtPath} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <span>⚠️ Orphan:</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>{wtPath}</span>
              <button style={{ fontSize: '11px', padding: '2px 8px' }} onClick={() => handleCleanupOrphan(wtPath)}>{t('cleanup')}</button>
            </div>
          ))}
        </div>
      )}

      {/* Issue list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sortedIssues.map((issueState) => (
          <IssueRow key={issueState.issue.number} issueState={issueState}
            onClick={() => window.clauboy.openAgent(issueState.issue.number).catch(console.error)} />
        ))}

        {/* Browse panel */}
        {browseOpen && (
          <div>
            <div style={{
              padding: '6px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.6px', background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border)', borderTop: sortedIssues.length > 0 ? '1px solid var(--border)' : undefined,
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <span style={{ flex: 1 }}>All open issues</span>
              <button style={{ fontSize: '11px', padding: '2px 8px', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}
                onClick={() => window.clauboy.createIssueUrl().catch(console.error)}>+ New</button>
            </div>

            {allLoading && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>}

            {!allLoading && filteredAllIssues?.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                {filter ? 'No matching issues.' : 'No open issues.'}
              </div>
            )}

            {!allLoading && filteredAllIssues?.map((issue) => (
              <AllIssueRow key={issue.number} issue={issue}
                isClauboy={clauboyIssueNumbers.has(issue.number)}
                onStart={() => void handleStartIssue(issue.number)}
                starting={startingIssue === issue.number} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)' }}>
        <button onClick={() => window.clauboy.createIssueUrl().catch(console.error)} style={{ fontSize: '12px', padding: '4px 10px' }}>+ {t('new_issue')}</button>
        <span style={{ flex: 1 }} />
        {appState.lastSyncAt && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('last_sync')}: {new Date(appState.lastSyncAt).toLocaleTimeString()}</span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>{VERSION}</span>
      </div>
    </div>
  )
}
