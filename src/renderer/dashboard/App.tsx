import React, { useEffect, useState } from 'react'
import { AppState, Config, IssueState, GitHubIssue } from '../../shared/types'
import { VERSION } from '../../shared/version'
import { useI18n } from '../shared/useI18n'

type RowState =
  | { kind: 'starting'; detail: string }
  | { kind: 'busy'; elapsed: number | null; capturedAt: string | null }
  | { kind: 'waiting'; elapsed: number | null; capturedAt: string | null }
  | { kind: 'failed'; detail: string }
  | { kind: 'colleague'; login: string; labels: string[] }
  | { kind: 'idle' }

function getRowState(issueState: IssueState | null, trustedUser: string): RowState {
  if (!issueState) return { kind: 'idle' }

  const isColleague = !!issueState.labeledBy && issueState.labeledBy !== trustedUser
  if (isColleague) {
    return { kind: 'colleague', login: issueState.labeledBy!, labels: issueState.clauboyLabels }
  }

  if (issueState.containerStatus === 'error') {
    return { kind: 'failed', detail: issueState.errorMessage ?? 'Unknown error' }
  }

  if (issueState.loadingStep) {
    return { kind: 'starting', detail: issueState.loadingStep }
  }

  if (issueState.containerStatus === 'running') {
    const elapsed = issueState.agentElapsedSeconds
    const capturedAt = issueState.agentElapsedCapturedAt
    if (issueState.agentActivity === 'waiting') return { kind: 'waiting', elapsed, capturedAt }
    return { kind: 'busy', elapsed, capturedAt }
  }

  // Container not yet running but issue is tracked (has clauboy label, waiting for poll)
  return { kind: 'starting', detail: 'Queued' }
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function StateBadge({ state, onRetry, starting }: {
  state: RowState
  onRetry?: () => void
  starting?: boolean
}): React.ReactElement {
  switch (state.kind) {
    case 'starting':
      return <span className="badge badge-starting" title={state.detail}>Starting</span>
    case 'busy':
      return (
        <span className="badge badge-busy" title={`Agent is working — no action needed${state.elapsed !== null ? `\nElapsed: ${formatElapsed(state.elapsed)}` : ''}`}>
          Busy
        </span>
      )
    case 'waiting':
      return (
        <span className="badge badge-waiting" title={`Agent needs your input${state.elapsed !== null ? `\nWaiting: ${formatElapsed(state.elapsed)}` : ''}`}>
          Waiting
        </span>
      )
    case 'failed':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span className="badge badge-error" title={state.detail}>Failed</span>
          {onRetry && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry() }}
              style={{ fontSize: '11px', padding: '2px 8px' }}
              title="Retry starting the agent"
            >Retry</button>
          )}
        </span>
      )
    case 'colleague': {
      const clauboyStatus = state.labels.includes('clauboy:running') ? 'running'
        : state.labels.includes('clauboy:done') ? 'done'
        : state.labels.includes('clauboy:error') ? 'error'
        : 'queued'
      return <span className="badge badge-colleague" title={`Managed by ${state.login} (${clauboyStatus})`}>{state.login}</span>
    }
    case 'idle':
      return (
        <span className="badge badge-idle" title="Click to start a clauboy agent">
          {starting ? 'Starting…' : 'Idle'}
        </span>
      )
  }
}

function IssueRow({ issue, state, onClick, onRetry, onStart, starting }: {
  issue: GitHubIssue
  state: RowState
  onClick?: () => void
  onRetry?: () => void
  onStart?: () => void
  starting?: boolean
}): React.ReactElement {
  const [now, setNow] = useState(() => Date.now())
  const isActive = state.kind === 'busy' || state.kind === 'waiting' || state.kind === 'starting' || state.kind === 'failed'

  useEffect(() => {
    if (state.kind !== 'busy' && state.kind !== 'waiting') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state.kind])

  // Compute live elapsed from the captured snapshot + wall clock delta
  let displayState = state
  if ((state.kind === 'busy' || state.kind === 'waiting') && state.elapsed !== null && state.capturedAt) {
    const delta = Math.floor((now - new Date(state.capturedAt).getTime()) / 1000)
    displayState = { ...state, elapsed: state.elapsed + delta }
  }

  const isColleague = state.kind === 'colleague'
  const isClickable = !isColleague

  const handleRowClick = (): void => {
    if (isColleague) return
    if (state.kind === 'idle') {
      onStart?.()
    } else {
      onClick?.()
    }
  }

  return (
    <div
      onClick={isClickable ? handleRowClick : undefined}
      style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        cursor: isClickable ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: '10px',
        transition: 'background 0.1s',
        opacity: isColleague ? 0.6 : 1
      }}
      onMouseEnter={(e) => { if (isClickable) e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>#{issue.number}</span>
          <span style={{
            fontWeight: isActive ? 500 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: '13px'
          }}>
            {issue.title}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
          {issue.labels.map((label) => (
            <span key={label.name} style={{
              fontSize: '10px', color: 'var(--text-muted)'
            }}>{label.name}</span>
          ))}
        </div>
      </div>
      <StateBadge state={displayState} onRetry={onRetry} starting={starting} />
      <button
        className="icon-btn"
        title="Open issue on GitHub"
        style={{ fontSize: '13px', flexShrink: 0 }}
        onClick={(e) => { e.stopPropagation(); window.clauboy.openExternal(issue.html_url).catch(console.error) }}
      >↗</button>
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
  const [config, setConfig] = useState<Config | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [allIssues, setAllIssues] = useState<GitHubIssue[] | null>(null)
  const [allLoading, setAllLoading] = useState(false)
  const [startingIssue, setStartingIssue] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'number' | 'activity'>('number')
  const { t } = useI18n()

  useEffect(() => {
    window.clauboy.getConfig().then(setConfig).catch(console.error)
    const unsubConfig = window.clauboy.onConfigUpdate(setConfig)
    window.clauboy.getState().then(setAppState).catch(console.error)
    const unsubState = window.clauboy.onStateUpdate(setAppState)
    return () => { unsubState(); unsubConfig() }
  }, [])

  useEffect(() => {
    const onFocus = (): void => {
      setAppState((prev) => {
        const stale = !prev?.lastSyncAt || Date.now() - new Date(prev.lastSyncAt).getTime() > 30_000
        if (stale) window.clauboy.forceSync().catch(console.error)
        return prev
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const loadAllIssues = (): void => {
    setAllLoading(true)
    window.clauboy.listAllIssues()
      .then(setAllIssues)
      .catch(console.error)
      .finally(() => setAllLoading(false))
  }

  useEffect(() => {
    if (showAll && allIssues === null) loadAllIssues()
  }, [showAll])

  const handleStartIssue = async (issueNumber: number): Promise<void> => {
    setStartingIssue(issueNumber)
    try {
      await window.clauboy.labelIssue(issueNumber)
    } catch (err) {
      console.error(err)
    } finally {
      setStartingIssue(null)
    }
  }

  const handleForceSync = (): void => {
    window.clauboy.forceSync().catch(console.error)
    if (showAll) { setAllIssues(null); loadAllIssues() }
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

  const trustedUser = config?.github.trustedUser ?? ''

  // My active issues (not colleague's)
  const myIssues = appState.issues
    .filter((s) => {
      const state = getRowState(s, trustedUser)
      return state.kind !== 'colleague'
    })

  const activityOrder = (s: IssueState): number => {
    const state = getRowState(s, trustedUser)
    if (state.kind === 'waiting') return 0
    if (state.kind === 'failed') return 1
    if (state.kind === 'busy') return 2
    if (state.kind === 'starting') return 3
    return 4
  }

  const sortedMyIssues = [...myIssues]
    .sort((a, b) => {
      if (sortBy === 'number') return a.issue.number - b.issue.number
      if (sortBy === 'activity') return activityOrder(a) - activityOrder(b)
      return new Date(b.issue.updated_at).getTime() - new Date(a.issue.updated_at).getTime()
    })
    .filter((s) => matchesFilter(s.issue.title, s.issue.number, filter))

  // "Other" issues: all open issues minus my active ones
  const myIssueNumbers = new Set(myIssues.map((s) => s.issue.number))
  const otherIssues = (allIssues ?? [])
    .filter((i) => !myIssueNumbers.has(i.number))
    .filter((i) => matchesFilter(i.title, i.number, filter))
    .sort((a, b) => {
      if (sortBy === 'number') return a.number - b.number
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', gap: '8px', background: 'var(--bg-secondary)' }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter issues…"
          style={{
            flex: 1, minWidth: 0, fontSize: '12px', padding: '3px 8px',
            ...(filter.trim() ? {
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              outline: '2px solid var(--accent)',
              borderColor: 'var(--accent)'
            } : {})
          }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={{ fontSize: '11px', padding: '2px 4px', flex: '0 0 auto', width: 'auto' }}
          title="Sort order"
        >
          <option value="activity">↕ Activity</option>
          <option value="updated">↕ Last updated</option>
          <option value="number">↕ Issue #</option>
        </select>
        {appState.isSyncing && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>⟳</span>}
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
        {/* My active issues */}
        {sortedMyIssues.map((issueState) => {
          const state = getRowState(issueState, trustedUser)
          return (
            <IssueRow
              key={issueState.issue.number}
              issue={issueState.issue}
              state={state}
              onClick={() => window.clauboy.openAgent(issueState.issue.number).catch(console.error)}
              onRetry={state.kind === 'failed' ? () => window.clauboy.retryAgent(issueState.issue.number).catch(console.error) : undefined}
            />
          )
        })}

        {sortedMyIssues.length === 0 && !showAll && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No active issues
          </div>
        )}

        {/* Toggle button for other issues */}
        <div
          onClick={() => setShowAll((v) => !v)}
          style={{
            padding: '8px 16px', fontSize: '12px', color: 'var(--text)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)',
            userSelect: 'none'
          }}
        >
          <span>{showAll ? '▾' : '▸'}</span>
          <span style={{ flex: 1 }}>{showAll ? 'Hide other issues' : 'Show all issues'}</span>
          <button
            className="icon-btn"
            onClick={(e) => { e.stopPropagation(); window.clauboy.createIssueUrl().catch(console.error) }}
            title="Create new issue on GitHub"
          >+ New issue</button>
        </div>

        {/* Other issues (expanded) */}
        {showAll && (
          <>
            {allLoading && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</div>
            )}
            {!allLoading && otherIssues.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                {filter ? 'No matching issues.' : 'No other open issues.'}
              </div>
            )}
            {!allLoading && otherIssues.map((issue) => {
              const tracked = appState.issues.find((i) => i.issue.number === issue.number)
              const state = getRowState(tracked ?? null, trustedUser)
              return (
                <IssueRow
                  key={issue.number}
                  issue={issue}
                  state={state}
                  onStart={() => void handleStartIssue(issue.number)}
                  starting={startingIssue === issue.number}
                />
              )
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>{VERSION}</span>
        <span style={{ flex: 1 }} />
        {appState.lastSyncAt && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('last_sync')}: {new Date(appState.lastSyncAt).toLocaleTimeString()}</span>
        )}
        <button className="icon-btn" onClick={handleForceSync} title={t('sync')}>↺</button>
      </div>
    </div>
  )
}
