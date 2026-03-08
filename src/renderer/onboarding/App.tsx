import React, { useState } from 'react'
import { Config, DEFAULT_BUTTONS } from '../../shared/types'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const STEP_TITLES = [
  'GitHub Personal Access Token',
  'GitHub App Credentials',
  'Repository Configuration',
  'Clone Repository',
  'Docker Setup',
  'Ready!'
]

const defaultConfig: Config = {
  github: {
    token: '',
    owner: '',
    repo: '',
    trustedUser: '',
    appId: '',
    installationId: '',
    privateKey: ''
  },
  docker: {
    socketPath: '//./pipe/docker_engine',
    imageName: 'clauboy-agent',
    networkName: 'clauboy-net',
    memoryLimit: '2g',
    cpuLimit: '1.0'
  },
  buttons: DEFAULT_BUTTONS,
  language: 'en',
  editorCommand: 'code',
  claudeApiKey: '',
  cloneDir: ''
}

export default function OnboardingApp(): React.ReactElement {
  const [step, setStep] = useState<Step>(1)
  const [config, setConfig] = useState<Config>(defaultConfig)
  const [cloneProgress, setCloneProgress] = useState<string>('')
  const [buildLogs, setBuildLogs] = useState<string[]>([])
  const [dockerOk, setDockerOk] = useState<boolean | null>(null)
  const [error, setError] = useState<string>('')

  const updateGithub = (key: keyof Config['github'], value: string): void => {
    setConfig((c) => ({ ...c, github: { ...c.github, [key]: value } }))
  }

  const updateDocker = (key: keyof Config['docker'], value: string): void => {
    setConfig((c) => ({ ...c, docker: { ...c.docker, [key]: value } }))
  }

  const handleClone = async (): Promise<void> => {
    setError('')
    setCloneProgress('Starting...')
    try {
      await window.clauboy.cloneRepo((msg) => setCloneProgress(msg))
      setStep(5)
    } catch (err) {
      setError(String(err))
    }
  }

  const handleDockerCheck = async (): Promise<void> => {
    setError('')
    const ok = await window.clauboy.checkDocker()
    setDockerOk(ok)
    if (!ok) {
      setError('Docker is not running. Please start Docker Desktop and try again.')
    }
  }

  const handleBuildImage = async (): Promise<void> => {
    setError('')
    setBuildLogs([])
    try {
      await window.clauboy.buildImage(
        (log) => setBuildLogs((prev) => [...prev, log]),
        config.docker.imageName
      )
      setStep(6)
    } catch (err) {
      setError(String(err))
    }
  }

  const handleComplete = async (): Promise<void> => {
    setError('')
    try {
      await window.clauboy.completeOnboarding(config)
    } catch (err) {
      setError(String(err))
    }
  }

  const progress = ((step - 1) / 5) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '24px' }}>🤠</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>Clauboy Setup</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Step {step} of 6: {STEP_TITLES[step - 1]}
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '4px', height: '4px' }}>
          <div style={{ background: 'var(--accent)', height: '100%', borderRadius: '4px', width: `${progress}%`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {step === 1 && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
              Create a GitHub Personal Access Token with <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>repo</code> and <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>issues</code> scopes.
            </p>
            <button
              onClick={() => window.clauboy.openExternal('https://github.com/settings/tokens/new?description=Clauboy&scopes=repo,issues').catch(console.error)}
              style={{ marginBottom: '16px', fontSize: '12px' }}
            >
              🔗 Open GitHub Token Page
            </button>
            <div className="form-group">
              <label>Personal Access Token</label>
              <input
                type="password"
                value={config.github.token}
                onChange={(e) => updateGithub('token', e.target.value)}
                placeholder="ghp_..."
              />
            </div>
            <div className="form-group">
              <label>Claude API Key (ANTHROPIC_API_KEY)</label>
              <input
                type="password"
                value={config.claudeApiKey ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, claudeApiKey: e.target.value }))}
                placeholder="sk-ant-..."
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
              Optional: Configure a GitHub App for bot comments. Leave empty to use your PAT instead.
            </p>
            <div className="form-group">
              <label>GitHub App ID</label>
              <input
                value={config.github.appId ?? ''}
                onChange={(e) => updateGithub('appId', e.target.value)}
                placeholder="123456"
              />
            </div>
            <div className="form-group">
              <label>Installation ID</label>
              <input
                value={config.github.installationId ?? ''}
                onChange={(e) => updateGithub('installationId', e.target.value)}
                placeholder="87654321"
              />
            </div>
            <div className="form-group">
              <label>Private Key (PEM)</label>
              <textarea
                value={config.github.privateKey ?? ''}
                onChange={(e) => updateGithub('privateKey', e.target.value)}
                placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '11px' }}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="form-group">
              <label>Repository Owner</label>
              <input
                value={config.github.owner}
                onChange={(e) => updateGithub('owner', e.target.value)}
                placeholder="your-org"
              />
            </div>
            <div className="form-group">
              <label>Repository Name</label>
              <input
                value={config.github.repo}
                onChange={(e) => updateGithub('repo', e.target.value)}
                placeholder="my-project"
              />
            </div>
            <div className="form-group">
              <label>Trusted User (can trigger agents via labels)</label>
              <input
                value={config.github.trustedUser}
                onChange={(e) => updateGithub('trustedUser', e.target.value)}
                placeholder="your-github-username"
              />
            </div>
            <div className="form-group">
              <label>Editor Command</label>
              <input
                value={config.editorCommand}
                onChange={(e) => setConfig((c) => ({ ...c, editorCommand: e.target.value }))}
                placeholder="code"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
              Clauboy will clone {config.github.owner}/{config.github.repo} to manage worktrees.
            </p>
            {cloneProgress ? (
              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius)', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                {cloneProgress}
              </div>
            ) : (
              <button className="primary" onClick={() => void handleClone()}>
                Clone Repository
              </button>
            )}
          </div>
        )}

        {step === 5 && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
              Docker must be running. Clauboy will build the agent image.
            </p>
            <div className="form-group">
              <label>Image Name</label>
              <input
                value={config.docker.imageName}
                onChange={(e) => updateDocker('imageName', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => void handleDockerCheck()}>
                Check Docker
              </button>
              {dockerOk === true && <span style={{ color: 'var(--accent-success)', alignSelf: 'center' }}>✓ Docker is running</span>}
            </div>
            {dockerOk && (
              <button className="primary" onClick={() => void handleBuildImage()}>
                Build Agent Image
              </button>
            )}
            {buildLogs.length > 0 && (
              <div style={{
                marginTop: '12px',
                background: 'var(--bg-secondary)',
                padding: '8px',
                borderRadius: 'var(--radius)',
                fontSize: '11px',
                fontFamily: 'monospace',
                maxHeight: '150px',
                overflowY: 'auto',
                color: 'var(--text-secondary)'
              }}>
                {buildLogs.join('')}
              </div>
            )}
          </div>
        )}

        {step === 6 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤠</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Ready to ride!</div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px' }}>
              Clauboy is configured and ready. Add the <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>clauboy</code> label to any GitHub issue to start an agent.
            </p>
            <button className="primary" onClick={() => void handleComplete()}>
              Open Dashboard
            </button>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: '16px',
            padding: '10px',
            background: 'rgba(224, 82, 82, 0.1)',
            border: '1px solid rgba(224, 82, 82, 0.3)',
            borderRadius: 'var(--radius)',
            color: 'var(--accent-danger)',
            fontSize: '12px'
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Navigation */}
      {step < 6 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid var(--border)', marginTop: '16px' }}>
          <button
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1}
            style={{ opacity: step === 1 ? 0.4 : 1 }}
          >
            ← Back
          </button>
          <button
            className="primary"
            onClick={() => {
              if (step === 4) return // handled by clone button
              if (step === 5) return // handled by build button
              setStep((s) => ((s + 1) as Step))
            }}
            disabled={step === 4 || step === 5}
            style={{ opacity: (step === 4 || step === 5) ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
