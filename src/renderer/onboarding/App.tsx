import React, { useState, useEffect, useRef } from 'react'
import { Config, DEFAULT_BUTTONS } from '../../shared/types'
import { StepTabs } from '../shared/StepTabs'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const STEP_TITLES = [
  'API Keys',
  'GitHub Bot',
  'Repository',
  'Cloning…',
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
    imageName: 'bartfastiel/clauboy-agent:latest',
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

type ValidationState = 'idle' | 'loading' | 'ok' | 'error'

function ValidationIcon({ state }: { state: ValidationState }): React.ReactElement | null {
  if (state === 'loading') return <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>checking…</span>
  if (state === 'ok') return <span style={{ color: 'var(--accent-success)', fontSize: '13px' }}>✓</span>
  if (state === 'error') return <span style={{ color: 'var(--accent-danger)', fontSize: '13px' }}>✗</span>
  return null
}

function StatusRow({ label, state, detail }: { label: string; state: ValidationState | 'done'; detail?: string }): React.ReactElement {
  const icon = state === 'loading' ? '⏳' : state === 'ok' || state === 'done' ? '✓' : state === 'error' ? '✗' : '○'
  const color = state === 'ok' || state === 'done' ? 'var(--accent-success)' : state === 'error' ? 'var(--accent-danger)' : 'var(--text-secondary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '13px' }}>
      <span style={{ color, width: '16px', textAlign: 'center' }}>{icon}</span>
      <span>{label}</span>
      {detail && <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{detail}</span>}
    </div>
  )
}

export default function OnboardingApp(): React.ReactElement {
  const [step, setStep] = useState<Step>(1)
  const [config, setConfig] = useState<Config>(defaultConfig)
  const [error, setError] = useState<string>('')

  // Step 1 validation
  const [githubValidation, setGithubValidation] = useState<ValidationState>('idle')
  const [anthropicValidation, setAnthropicValidation] = useState<ValidationState>('idle')
  const [githubUser, setGithubUser] = useState<{ login: string; name: string | null } | null>(null)

  // Step 2 – GitHub App creation
  const [appCreating, setAppCreating] = useState(false)
  const [appWaitingInstall, setAppWaitingInstall] = useState(false)
  const [appInstallUrl, setAppInstallUrl] = useState('')

  // Step 3 – repo autocomplete
  const [repos, setRepos] = useState<Array<{ owner: string; name: string }>>([])

  // Step 4 – clone
  const [cloneStatus, setCloneStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [cloneProgress, setCloneProgress] = useState('')

  // Step 5 – docker
  const [dockerStatus, setDockerStatus] = useState<'idle' | 'checking' | 'pulling' | 'done' | 'error'>('idle')
  const [buildLogs, setBuildLogs] = useState<string[]>([])

  // Load persisted config on mount
  useEffect(() => {
    window.clauboy.getConfig().then((saved) => {
      setConfig((c) => ({
        ...c,
        github: {
          ...c.github,
          token: saved.github.token || c.github.token,
          owner: saved.github.owner || c.github.owner,
          repo: saved.github.repo || c.github.repo,
          trustedUser: saved.github.trustedUser || c.github.trustedUser,
          appId: saved.github.appId || c.github.appId,
          installationId: saved.github.installationId || c.github.installationId,
          privateKey: saved.github.privateKey || c.github.privateKey,
        },
        claudeApiKey: saved.claudeApiKey || c.claudeApiKey,
        editorCommand: saved.editorCommand || c.editorCommand,
        docker: { ...c.docker, ...saved.docker },
      }))
    }).catch(() => {/* ignore */})
  }, [])

  // Persist config whenever it changes
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    window.clauboy.saveConfig(config).catch(() => {/* ignore */})
  }, [config])

  // Auto-clone when entering step 4
  useEffect(() => {
    if (step !== 4 || cloneStatus !== 'idle') return
    setCloneStatus('running')
    setCloneProgress('Starting…')
    window.clauboy.cloneRepo((msg) => setCloneProgress(msg))
      .then(() => { setCloneStatus('done'); setStep(5) })
      .catch((err: Error) => { setCloneStatus('error'); setError(String(err)) })
  }, [step])

  // Auto-check docker then auto-pull when entering step 5
  useEffect(() => {
    if (step !== 5 || dockerStatus !== 'idle') return
    setDockerStatus('checking')
    window.clauboy.checkDocker().then((ok) => {
      if (!ok) {
        setDockerStatus('error')
        setError('Docker is not running. Please start Docker Desktop, then click Retry.')
        return
      }
      setDockerStatus('pulling')
      setBuildLogs([])
      return window.clauboy.pullImage(
        config.docker.imageName,
        (log) => setBuildLogs((prev) => [...prev, log])
      ).then(() => { setDockerStatus('done'); setStep(6) })
    }).catch((err: Error) => { setDockerStatus('error'); setError(String(err)) })
  }, [step, dockerStatus])

  const updateGithub = (key: keyof Config['github'], value: string): void =>
    setConfig((c) => ({ ...c, github: { ...c.github, [key]: value } }))

  const handleStep1Next = async (): Promise<void> => {
    setError('')
    if (!config.github.token) { setError('GitHub Personal Access Token is required.'); return }

    setGithubValidation('loading')
    try {
      const user = await window.clauboy.validateGithubToken(config.github.token)
      setGithubUser(user)
      setGithubValidation('ok')
      setConfig((c) => ({
        ...c,
        github: {
          ...c.github,
          owner: c.github.owner || user.login,
          trustedUser: c.github.trustedUser || user.login
        }
      }))
      window.clauboy.listRepos(config.github.token).then(setRepos).catch(() => {/* ignore */})
    } catch (err) {
      setGithubValidation('error')
      setError(`GitHub token invalid: ${String(err)}`)
      return
    }

    if (config.claudeApiKey) {
      setAnthropicValidation('loading')
      try {
        await window.clauboy.validateAnthropicKey(config.claudeApiKey)
        setAnthropicValidation('ok')
      } catch (err) {
        setAnthropicValidation('error')
        setError(`Anthropic API key invalid: ${String(err)}`)
        return
      }
    }
    setStep(2)
  }

  const handleCreateApp = async (): Promise<void> => {
    setError('')
    setAppCreating(true)
    try {
      const creds = await window.clauboy.createGithubApp(config.github.owner)
      setConfig((c) => ({ ...c, github: { ...c.github, appId: creds.appId, privateKey: creds.privateKey } }))
      setAppInstallUrl(creds.installUrl)
      setAppCreating(false)
      setAppWaitingInstall(true)
      // Open install page and poll for installation ID
      await window.clauboy.openExternal(creds.installUrl)
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        const id = await window.clauboy.getInstallationId(creds.appId, creds.privateKey, config.github.owner)
        if (id) {
          setConfig((c) => ({ ...c, github: { ...c.github, installationId: id } }))
          setAppWaitingInstall(false)
          setStep(3)
          return
        }
      }
      setError('Could not detect app installation after 3 minutes. You can manually enter the Installation ID below.')
      setAppWaitingInstall(false)
    } catch (err) {
      setError(String(err))
      setAppCreating(false)
      setAppWaitingInstall(false)
    }
  }

  const handleComplete = async (): Promise<void> => {
    setError('')
    try { await window.clauboy.completeOnboarding(config) }
    catch (err) { setError(String(err)) }
  }

  const filteredRepos = repos.filter((r) => r.owner === config.github.owner)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ fontSize: '20px' }}>🤠</span>
        <span style={{ fontWeight: 700, fontSize: '15px' }}>Clauboy Setup</span>
      </div>

      {/* Step tabs – only past and current step are reachable */}
      <StepTabs
        steps={STEP_TITLES}
        current={step - 1}
        maxReachable={step - 1}
        onSelect={(i) => { setError(''); setStep((i + 1) as Step) }}
      />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* ── Step 1: API Keys ── */}
        {step === 1 && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
              Create a GitHub PAT with <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>repo</code> and <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>issues</code> scopes.
            </p>
            <button
              onClick={() => window.clauboy.openExternal('https://github.com/settings/tokens/new?description=Clauboy&scopes=repo,issues').catch(console.error)}
              style={{ marginBottom: '16px', fontSize: '12px' }}
            >
              🔗 Open GitHub Token Page
            </button>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                GitHub Personal Access Token
                <ValidationIcon state={githubValidation} />
                {githubUser && <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 400 }}>(@{githubUser.login})</span>}
              </label>
              <input
                type="password"
                value={config.github.token}
                onChange={(e) => { updateGithub('token', e.target.value); setGithubValidation('idle'); setGithubUser(null) }}
                placeholder="ghp_…"
              />
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Anthropic API Key
                <ValidationIcon state={anthropicValidation} />
              </label>
              <input
                type="password"
                value={config.claudeApiKey ?? ''}
                onChange={(e) => { setConfig((c) => ({ ...c, claudeApiKey: e.target.value })); setAnthropicValidation('idle') }}
                placeholder="sk-ant-…"
              />
              <button
                onClick={() => window.clauboy.openExternal('https://console.anthropic.com/settings/keys').catch(console.error)}
                style={{ marginTop: '6px', fontSize: '11px' }}
              >
                🔗 Open Anthropic Console
              </button>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Optional if you authenticate via 🔑 Auth in the agent window.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 2: GitHub Bot ── */}
        {step === 2 && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
              Clauboy can post issue comments as a dedicated bot account instead of your personal account.
            </p>

            {!appCreating && !appWaitingInstall && !config.github.appId && (
              <button
                className="primary"
                onClick={() => void handleCreateApp()}
                style={{ marginBottom: '12px', width: '100%' }}
              >
                ✨ Create Bot App Automatically
              </button>
            )}

            {appCreating && (
              <div style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                ⏳ Opening GitHub to create your bot app…
              </div>
            )}

            {appWaitingInstall && (
              <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                <div style={{ color: 'var(--accent-success)', marginBottom: '8px' }}>✓ App created!</div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  ⏳ Waiting for you to install the app on your account…
                  <br /><br />
                  <button onClick={() => window.clauboy.openExternal(appInstallUrl).catch(console.error)} style={{ fontSize: '11px' }}>
                    🔗 Reopen install page
                  </button>
                </div>
              </div>
            )}

            {config.github.appId && !appWaitingInstall && (
              <div style={{ marginBottom: '12px' }}>
                <StatusRow label="App created" state="done" detail={`ID: ${config.github.appId}`} />
                {config.github.installationId
                  ? <StatusRow label="App installed" state="done" detail={`Installation: ${config.github.installationId}`} />
                  : <StatusRow label="Waiting for installation…" state="loading" />
                }
              </div>
            )}

            <button onClick={() => setStep(3)} style={{ marginBottom: '16px', width: '100%', opacity: 0.6 }}>
              Skip → Use my PAT for bot comments
            </button>

            {/* Manual fallback */}
            {(config.github.appId || error) && (
              <details style={{ marginTop: '8px' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}>Manual credentials</summary>
                <div style={{ marginTop: '12px' }}>
                  <div className="form-group">
                    <label>App ID</label>
                    <input value={config.github.appId ?? ''} onChange={(e) => updateGithub('appId', e.target.value)} placeholder="123456" />
                  </div>
                  <div className="form-group">
                    <label>Installation ID</label>
                    <input value={config.github.installationId ?? ''} onChange={(e) => updateGithub('installationId', e.target.value)} placeholder="87654321" />
                  </div>
                  <div className="form-group">
                    <label>Private Key (PEM)</label>
                    <textarea
                      value={config.github.privateKey ?? ''}
                      onChange={(e) => updateGithub('privateKey', e.target.value)}
                      placeholder="-----BEGIN RSA PRIVATE KEY-----…"
                      style={{ minHeight: '80px', fontFamily: 'monospace', fontSize: '11px' }}
                    />
                  </div>
                  {config.github.appId && config.github.installationId && config.github.privateKey && (
                    <button className="primary" onClick={() => setStep(3)}>Next →</button>
                  )}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ── Step 3: Repository ── */}
        {step === 3 && (
          <div>
            <div className="form-group">
              <label>Repository Owner</label>
              <input
                list="owners-datalist"
                value={config.github.owner}
                onChange={(e) => updateGithub('owner', e.target.value)}
                placeholder="your-org"
              />
              {repos.length > 0 && (
                <datalist id="owners-datalist">
                  {[...new Set(repos.map((r) => r.owner))].map((o) => <option key={o} value={o} />)}
                </datalist>
              )}
            </div>
            <div className="form-group">
              <label>Repository Name</label>
              <input
                list="repos-datalist"
                value={config.github.repo}
                onChange={(e) => updateGithub('repo', e.target.value)}
                placeholder="my-project"
              />
              {filteredRepos.length > 0 && (
                <datalist id="repos-datalist">
                  {filteredRepos.map((r) => <option key={r.name} value={r.name} />)}
                </datalist>
              )}
            </div>
            <div className="form-group">
              <label>Trusted User</label>
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

        {/* ── Step 4: Clone (automatic) ── */}
        {step === 4 && (
          <div>
            <StatusRow
              label={cloneStatus === 'running' ? 'Cloning repository…' : cloneStatus === 'done' ? 'Repository cloned' : 'Clone failed'}
              state={cloneStatus === 'running' ? 'loading' : cloneStatus === 'done' ? 'ok' : 'error'}
              detail={`${config.github.owner}/${config.github.repo}`}
            />
            {cloneProgress && (
              <div style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: 'var(--radius)', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)', marginTop: '8px' }}>
                {cloneProgress}
              </div>
            )}
            {cloneStatus === 'error' && (
              <button className="primary" style={{ marginTop: '12px' }} onClick={() => { setCloneStatus('idle'); setError('') }}>
                Retry
              </button>
            )}
          </div>
        )}

        {/* ── Step 5: Docker (automatic) ── */}
        {step === 5 && (
          <div>
            <StatusRow
              label="Check Docker"
              state={dockerStatus === 'idle' || dockerStatus === 'checking' ? 'loading' : dockerStatus === 'error' ? 'error' : 'ok'}
            />
            {(dockerStatus === 'pulling' || dockerStatus === 'done') && (
              <StatusRow
                label={dockerStatus === 'pulling' ? 'Pulling agent image…' : 'Agent image ready'}
                state={dockerStatus === 'pulling' ? 'loading' : 'ok'}
              />
            )}
            {buildLogs.length > 0 && (
              <div style={{
                marginTop: '8px', background: 'var(--bg-secondary)', padding: '8px',
                borderRadius: 'var(--radius)', fontSize: '11px', fontFamily: 'monospace',
                maxHeight: '160px', overflowY: 'auto', color: 'var(--text-secondary)'
              }}>
                {buildLogs.join('')}
              </div>
            )}
            {dockerStatus === 'error' && (
              <button className="primary" style={{ marginTop: '12px' }} onClick={() => { setDockerStatus('idle'); setError('') }}>
                Retry
              </button>
            )}
          </div>
        )}

        {/* ── Step 6: Ready ── */}
        {step === 6 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤠</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Ready to ride!</div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px' }}>
              Add the <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>clauboy</code> label to any GitHub issue to start an agent.
            </p>
            <button className="primary" onClick={() => void handleComplete()}>
              Open Dashboard
            </button>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: '16px', padding: '10px',
            background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)',
            borderRadius: 'var(--radius)', color: 'var(--accent-danger)', fontSize: '12px'
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={() => { setError(''); setStep((s) => (s > 1 ? ((s - 1) as Step) : s)) }}
          disabled={step === 1 || step === 4 || step === 5 || step === 6}
          style={{ opacity: (step === 1 || step === 4 || step === 5 || step === 6) ? 0.3 : 1 }}
        >
          ← Back
        </button>

        {step === 1 && (
          <button className="primary" onClick={() => void handleStep1Next()}>
            Next →
          </button>
        )}
        {step === 3 && (
          <button
            className="primary"
            onClick={() => {
              if (!config.github.owner || !config.github.repo) {
                setError('Repository owner and name are required.')
                return
              }
              setError('')
              setStep(4)
            }}
          >
            Next →
          </button>
        )}
        {(step === 2 || step === 4 || step === 5 || step === 6) && <div />}
      </div>
    </div>
  )
}
