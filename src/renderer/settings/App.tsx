import React, { useEffect, useState } from 'react'
import { Config } from '../../shared/types'

export default function SettingsApp(): React.ReactElement {
  const [config, setConfig] = useState<Config | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.clauboy.getConfig().then(setConfig).catch(console.error)
  }, [])

  const handleSave = async (): Promise<void> => {
    if (!config) return
    setError('')
    setSaved(false)
    try {
      await window.clauboy.saveConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(String(err))
    }
  }

  const updateGithub = (key: keyof Config['github'], value: string): void => {
    setConfig((c) => c ? { ...c, github: { ...c.github, [key]: value } } : c)
  }

  const updateDocker = (key: keyof Config['docker'], value: string): void => {
    setConfig((c) => c ? { ...c, docker: { ...c.docker, [key]: value } } : c)
  }

  if (!config) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: '15px', flex: 1 }}>⚙ Settings</span>
        <button className="primary" onClick={() => void handleSave()}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <Section title="GitHub">
          <div className="form-group">
            <label>Personal Access Token</label>
            <input type="password" value={config.github.token} onChange={(e) => updateGithub('token', e.target.value)} placeholder="ghp_..." />
          </div>
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
        </Section>

        <Section title="Claude">
          <div className="form-group">
            <label>Anthropic API Key</label>
            <input type="password" value={config.claudeApiKey ?? ''} onChange={(e) => setConfig((c) => c ? { ...c, claudeApiKey: e.target.value } : c)} placeholder="sk-ant-..." />
          </div>
        </Section>

        <Section title="Docker">
          <div className="form-group">
            <label>Socket Path (Windows: //./pipe/docker_engine)</label>
            <input value={config.docker.socketPath ?? ''} onChange={(e) => updateDocker('socketPath', e.target.value)} />
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
        </Section>

        <Section title="General">
          <div className="form-group">
            <label>Language</label>
            <select value={config.language} onChange={(e) => setConfig((c) => c ? { ...c, language: e.target.value as 'en' | 'de' } : c)}>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
          <div className="form-group">
            <label>Editor Command</label>
            <input value={config.editorCommand} onChange={(e) => setConfig((c) => c ? { ...c, editorCommand: e.target.value } : c)} placeholder="code" />
          </div>
          <div className="form-group">
            <label>Clone Directory</label>
            <input value={config.cloneDir ?? ''} onChange={(e) => setConfig((c) => c ? { ...c, cloneDir: e.target.value } : c)} />
          </div>
        </Section>

        <div style={{ marginBottom: '8px' }}>
          <button onClick={() => window.clauboy.openButtonEditor().catch(console.error)}>
            🎛 Edit Buttons
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px', background: 'rgba(224, 82, 82, 0.1)', border: '1px solid rgba(224, 82, 82, 0.3)', borderRadius: 'var(--radius)', color: 'var(--accent-danger)', fontSize: '12px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}
