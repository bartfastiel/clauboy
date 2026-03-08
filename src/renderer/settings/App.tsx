import React, { useEffect, useState } from 'react'
import { Config } from '../../shared/types'
import { StepTabs } from '../shared/StepTabs'

const STEPS = ['API Keys', 'GitHub Bot', 'Repository', 'Docker', 'General']

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

export default function SettingsApp(): React.ReactElement {
  const [config, setConfig] = useState<Config | null>(null)
  const [savedConfig, setSavedConfig] = useState<Config | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [ghValidation, setGhValidation] = useState<ValidationState>('idle')
  const [ghUser, setGhUser] = useState<string | null>(null)
  const [anthropicValidation, setAnthropicValidation] = useState<ValidationState>('idle')

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

  const handleValidateAnthropic = async (): Promise<void> => {
    if (!config?.claudeApiKey) return
    setAnthropicValidation('loading')
    try {
      await window.clauboy.validateAnthropicKey(config.claudeApiKey)
      setAnthropicValidation('ok')
    } catch {
      setAnthropicValidation('error')
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

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
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Anthropic API Key
                <ValidationIcon state={anthropicValidation} />
              </label>
              <input
                type="password"
                value={config.claudeApiKey ?? ''}
                onChange={(e) => { setConfig((c) => c ? { ...c, claudeApiKey: e.target.value } : c); setAnthropicValidation('idle') }}
                placeholder="sk-ant-…"
                onBlur={() => { if (config.claudeApiKey) void handleValidateAnthropic() }}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <HelpLink url="https://console.anthropic.com/settings/keys" label="Open Anthropic Console" />
                <button onClick={() => void handleValidateAnthropic()} style={{ fontSize: '11px', marginTop: '4px' }}>Validate</button>
              </div>
            </div>
          </>
        )}

        {/* Step 1: GitHub Bot */}
        {step === 1 && (
          <>
            <div className="form-group">
              <label>GitHub App ID (optional)</label>
              <input value={config.github.appId ?? ''} onChange={(e) => updateGithub('appId', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Installation ID (optional)</label>
              <input value={config.github.installationId ?? ''} onChange={(e) => updateGithub('installationId', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Private Key PEM (optional)</label>
              <textarea value={config.github.privateKey ?? ''} onChange={(e) => updateGithub('privateKey', e.target.value)} style={{ fontFamily: 'monospace', fontSize: '11px', minHeight: '80px' }} />
            </div>
          </>
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

        {error && (
          <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)', borderRadius: 'var(--radius)', color: 'var(--accent-danger)', fontSize: '12px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
