import React, { useEffect, useState, useRef } from 'react'
import { Config, LogEntry } from '../../shared/types'
import { StepTabs } from '../shared/StepTabs'

const STEPS = ['API Keys', 'GitHub Bot', 'Repository', 'Docker', 'General', 'Logs']

const LOG_COLORS: Record<string, string> = {
  info: 'var(--text-secondary)',
  debug: 'var(--text-muted)',
  warn: '#e3b341',
  error: '#f85149'
}

const logBuffer: LogEntry[] = []
window.clauboy.onLogData((entry: LogEntry) => {
  logBuffer.push(entry)
  if (logBuffer.length > 1000) logBuffer.splice(0, logBuffer.length - 1000)
})

function LogsTab(): React.ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([...logBuffer])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.clauboy.onLogData((entry: LogEntry) => {
      setLogs((prev) => [...prev.slice(-999), entry])
    })
    return unsub
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  return (
    <div
      ref={logRef}
      style={{
        height: '100%', overflowY: 'auto', fontFamily: 'monospace',
        fontSize: '11px', lineHeight: '1.6', padding: '8px 0'
      }}
    >
      {logs.length === 0 && <span style={{ color: 'var(--text-muted)' }}>No logs yet…</span>}
      {logs.map((entry, i) => (
        <div key={i} style={{ color: LOG_COLORS[entry.level] ?? 'inherit', wordBreak: 'break-all' }}>
          <span style={{ opacity: 0.6 }}>{entry.ts.slice(11, 19)} </span>
          <span style={{ fontWeight: entry.level === 'error' ? 700 : 400 }}>[{entry.level.toUpperCase()}] </span>
          {entry.msg}
        </div>
      ))}
    </div>
  )
}

type ValidationState = 'idle' | 'loading' | 'ok' | 'error'

function ValidationIcon({ state }: { state: ValidationState }): React.ReactElement | null {
  if (state === 'loading') return <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>checking…</span>
  if (state === 'ok') return <span style={{ color: 'var(--accent-success)', fontSize: '13px' }}>✓</span>
  if (state === 'error') return <span style={{ color: 'var(--accent-danger)', fontSize: '13px' }}>✗</span>
  return null
}

function HelpLink({ url, label }: { url: string; label: string }): React.ReactElement {
  return (
    <button
      onClick={() => window.clauboy.openExternal(url).catch(console.error)}
      style={{ marginTop: '4px', fontSize: '11px' }}
    >
      🔗 {label}
    </button>
  )
}

function SettingsBotTab({ config, setConfig }: {
  config: Config
  setConfig: React.Dispatch<React.SetStateAction<Config | null>>
}): React.ReactElement {
  const botConfigured = !!(config.github.appId && config.github.installationId && config.github.privateKey)
  const [showDetails, setShowDetails] = useState(false)
  const [creating, setCreating] = useState(false)
  const [waitingInstall, setWaitingInstall] = useState(false)
  const [installUrl, setInstallUrl] = useState('')
  const [botError, setBotError] = useState('')

  const updateGithub = (key: keyof Config['github'], value: string): void =>
    setConfig((c) => c ? { ...c, github: { ...c.github, [key]: value } } : c)

  const handleCreateBot = async (): Promise<void> => {
    setBotError('')
    setCreating(true)
    try {
      const isOrg = config.github.owner !== config.github.trustedUser
      const creds = await window.clauboy.createGithubApp(config.github.owner, isOrg)
      setConfig((c) => c ? { ...c, github: { ...c.github, appId: creds.appId, privateKey: creds.privateKey } } : c)
      setInstallUrl(creds.installUrl)
      setCreating(false)
      setWaitingInstall(true)
      await window.clauboy.openExternal(creds.installUrl)
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        const id = await window.clauboy.getInstallationId(creds.appId, creds.privateKey, config.github.owner)
        if (id) {
          setConfig((c) => c ? { ...c, github: { ...c.github, installationId: id } } : c)
          setWaitingInstall(false)
          return
        }
      }
      setBotError('Could not detect app installation after 3 minutes.')
      setWaitingInstall(false)
    } catch (err) {
      setBotError(String(err))
      setCreating(false)
      setWaitingInstall(false)
    }
  }

  if (botConfigured && !showDetails) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ color: 'var(--accent-success)', fontSize: '16px' }}>✓</span>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Bot configured</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '12px' }}>
          Agent comments and PRs will appear as the bot account.
        </p>
        <button onClick={() => setShowDetails(true)} style={{ fontSize: '11px' }}>
          Show details
        </button>
      </div>
    )
  }

  return (
    <div>
      {!botConfigured && !creating && !waitingInstall && (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px' }}>
            No bot configured. Agent comments will appear as your personal account.
          </p>
          <button className="primary" onClick={() => void handleCreateBot()} style={{ width: '100%' }}>
            Set up Bot
          </button>
        </div>
      )}

      {creating && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '12px 0' }}>
          ⏳ Creating bot app on GitHub… Confirm in the browser.
        </div>
      )}

      {waitingInstall && (
        <div style={{ fontSize: '13px', padding: '12px 0' }}>
          <div style={{ color: 'var(--accent-success)', marginBottom: '8px' }}>✓ App created</div>
          <div style={{ color: 'var(--text-secondary)' }}>⏳ Install the app in the browser…</div>
          <button onClick={() => window.clauboy.openExternal(installUrl).catch(console.error)} style={{ fontSize: '11px', marginTop: '8px' }}>
            Reopen install page
          </button>
        </div>
      )}

      {botError && (
        <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)', borderRadius: 'var(--radius)', color: 'var(--accent-danger)', fontSize: '12px' }}>
          {botError}
        </div>
      )}

      {/* Raw fields shown on request or when editing */}
      {(showDetails || botError) && (
        <div style={{ marginTop: '16px' }}>
          <div className="form-group">
            <label>App ID</label>
            <input value={config.github.appId ?? ''} onChange={(e) => updateGithub('appId', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Installation ID</label>
            <input value={config.github.installationId ?? ''} onChange={(e) => updateGithub('installationId', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Private Key PEM</label>
            <textarea value={config.github.privateKey ?? ''} onChange={(e) => updateGithub('privateKey', e.target.value)} style={{ fontFamily: 'monospace', fontSize: '11px', minHeight: '80px' }} />
          </div>
          {showDetails && (
            <button onClick={() => setShowDetails(false)} style={{ fontSize: '11px' }}>Hide details</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function SettingsApp(): React.ReactElement {
  const [config, setConfig] = useState<Config | null>(null)
  const [savedConfig, setSavedConfig] = useState<Config | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [ghValidation, setGhValidation] = useState<ValidationState>('idle')
  const [ghUser, setGhUser] = useState<string | null>(null)

  useEffect(() => {
    window.clauboy.getConfig().then((c) => { setConfig(c); setSavedConfig(c) }).catch(console.error)
  }, [])

  const handleSave = async (): Promise<void> => {
    if (!config) return
    setError('')
    setSaved(false)
    try {
      await window.clauboy.saveConfig(config)
      setSavedConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(String(err))
    }
  }

  const handleValidateGh = async (): Promise<void> => {
    if (!config?.github.token) return
    setGhValidation('loading')
    setGhUser(null)
    try {
      const user = await window.clauboy.validateGithubToken(config.github.token)
      setGhValidation('ok')
      setGhUser(user.login)
    } catch {
      setGhValidation('error')
    }
  }

  const updateGithub = (key: keyof Config['github'], value: string): void =>
    setConfig((c) => c ? { ...c, github: { ...c.github, [key]: value } } : c)

  const updateDocker = (key: keyof Config['docker'], value: string): void =>
    setConfig((c) => c ? { ...c, docker: { ...c.docker, [key]: value } } : c)

  const isDirty = JSON.stringify(config) !== JSON.stringify(savedConfig)

  if (!config) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: 'var(--text-secondary)' }}>
        <span style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>⟳</span>
        Loading…
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: '15px', flex: 1 }}>⚙ Settings</span>
        <button
          className="primary"
          onClick={() => void handleSave()}
          disabled={!isDirty}
          style={{ opacity: isDirty ? 1 : 0.5 }}
        >
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* Step tabs – all steps always reachable */}
      <StepTabs
        steps={STEPS}
        current={step}
        maxReachable={STEPS.length - 1}
        onSelect={setStep}
      />

      {/* Content */}
      <div style={{ flex: 1, overflowY: step === 5 ? 'hidden' : 'auto', padding: step === 5 ? '0 16px' : '16px', display: 'flex', flexDirection: 'column' }}>

        {/* Step 0: API Keys */}
        {step === 0 && (
          <>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                GitHub Personal Access Token
                <ValidationIcon state={ghValidation} />
                {ghUser && <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 400 }}>(@{ghUser})</span>}
              </label>
              <input
                type="password"
                value={config.github.token}
                onChange={(e) => { updateGithub('token', e.target.value); setGhValidation('idle'); setGhUser(null) }}
                placeholder="ghp_…"
                onBlur={() => { if (config.github.token) void handleValidateGh() }}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <HelpLink url="https://github.com/settings/tokens/new?description=Clauboy&scopes=repo,issues" label="Create GitHub Token" />
                <button onClick={() => void handleValidateGh()} style={{ fontSize: '11px', marginTop: '4px' }}>Validate</button>
              </div>
            </div>
          </>
        )}

        {/* Step 1: GitHub Bot */}
        {step === 1 && (
          <SettingsBotTab config={config} setConfig={setConfig} />
        )}

        {/* Step 2: Repository */}
        {step === 2 && (
          <>
            <div className="form-group">
              <label>Repository Owner</label>
              <input value={config.github.owner} onChange={(e) => updateGithub('owner', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Repository Name</label>
              <input value={config.github.repo} onChange={(e) => updateGithub('repo', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Trusted User</label>
              <input value={config.github.trustedUser} onChange={(e) => updateGithub('trustedUser', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Editor Command</label>
              <input value={config.editorCommand} onChange={(e) => setConfig((c) => c ? { ...c, editorCommand: e.target.value } : c)} placeholder="code" />
            </div>
            <div className="form-group">
              <label>Clone Directory</label>
              <input value={config.cloneDir ?? ''} onChange={(e) => setConfig((c) => c ? { ...c, cloneDir: e.target.value } : c)} />
            </div>
          </>
        )}

        {/* Step 3: Docker */}
        {step === 3 && (
          <>
            <div className="form-group">
              <label>Socket Path</label>
              <input value={config.docker.socketPath ?? ''} onChange={(e) => updateDocker('socketPath', e.target.value)} placeholder="//./pipe/docker_engine" />
            </div>
            <div className="form-group">
              <label>Image Name</label>
              <input value={config.docker.imageName} onChange={(e) => updateDocker('imageName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Network Name</label>
              <input value={config.docker.networkName} onChange={(e) => updateDocker('networkName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Memory Limit (e.g. 2g)</label>
              <input value={config.docker.memoryLimit ?? ''} onChange={(e) => updateDocker('memoryLimit', e.target.value)} />
            </div>
            <div className="form-group">
              <label>CPU Limit (e.g. 1.0)</label>
              <input value={config.docker.cpuLimit ?? ''} onChange={(e) => updateDocker('cpuLimit', e.target.value)} />
            </div>
          </>
        )}

        {/* Step 4: General */}
        {step === 4 && (
          <>
            <div className="form-group">
              <label>Language</label>
              <select value={config.language} onChange={(e) => setConfig((c) => c ? { ...c, language: e.target.value as 'en' | 'de' } : c)}>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <button onClick={() => window.clauboy.openButtonEditor().catch(console.error)}>🎛 Edit Buttons</button>
            </div>
          </>
        )}

        {/* Step 5: Logs */}
        {step === 5 && <LogsTab />}

        {error && (
          <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)', borderRadius: 'var(--radius)', color: 'var(--accent-danger)', fontSize: '12px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
