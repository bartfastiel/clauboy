import React, { useState, useEffect, useRef } from 'react'
import { Config, DEFAULT_BUTTONS } from '../../shared/types'
import { StepTabs } from '../shared/StepTabs'

type Step = 1 | 2 | 3 | 4 | 5

const STEP_TITLES = [
  'API Keys',
  'Repository',
  'GitHub Bot',
  'Cloning…',
  'Docker Setup'
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

function BotSetupStep({
  config,
  setConfig,
  userLogin,
  appCreating,
  appWaitingInstall,
  appInstallUrl,
  error,
  onCreateApp,
  onNext,
  onSkip
}: {
  config: Config
  setConfig: React.Dispatch<React.SetStateAction<Config>>
  userLogin: string
  appCreating: boolean
  appWaitingInstall: boolean
  appInstallUrl: string
  error: string
  onCreateApp: (appOwner: string) => void
  onNext: () => void
  onSkip: () => void
}): React.ReactElement {
  const botConfigured = !!(config.github.appId && config.github.installationId && config.github.privateKey)
  const isOrg = config.github.owner !== userLogin
  const [appOwner, setAppOwner] = useState(isOrg ? config.github.owner : userLogin)

  // Auto-advance when bot is fully configured
  useEffect(() => {
    if (botConfigured && !appWaitingInstall) {
      onNext()
    }
  }, [botConfigured, appWaitingInstall])

  const updateGithub = (key: keyof Config['github'], value: string): void =>
    setConfig((c) => ({ ...c, github: { ...c.github, [key]: value } }))

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
        A GitHub App lets agents post comments as a bot instead of your personal account. This is optional — you can skip if you prefer comments to appear as you.
      </p>

      {!appCreating && !appWaitingInstall && !botConfigured && (
        <div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, marginBottom: '8px' }}>Create app on</div>
            {isOrg && (
              <div
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '6px' }}
                onClick={() => setAppOwner(config.github.owner)}
              >
                <input type="radio" name="app-owner" checked={appOwner === config.github.owner} readOnly style={{ margin: 0, flexShrink: 0, width: '14px', height: '14px' }} />
                <span style={{ whiteSpace: 'nowrap' }}><strong>{config.github.owner}</strong> (organization)</span>
              </div>
            )}
            <div
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '6px' }}
              onClick={() => setAppOwner(userLogin)}
            >
              <input type="radio" name="app-owner" checked={appOwner === userLogin} readOnly style={{ margin: 0, flexShrink: 0, width: '14px', height: '14px' }} />
              <span style={{ whiteSpace: 'nowrap' }}><strong>{userLogin}</strong> (personal account)</span>
            </div>
            {isOrg && appOwner !== userLogin && (
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '22px' }}>
                Requires org admin permissions on <strong>{config.github.owner}</strong>.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="primary" onClick={() => onCreateApp(appOwner)} style={{ flex: 1 }}>
              Create Bot App
            </button>
            <button onClick={onSkip} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Skip
            </button>
          </div>
        </div>
      )}

      {appCreating && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px 0' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>⏳ Creating bot app on GitHub…</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Confirm in the browser window that just opened.</span>
        </div>
      )}

      {appWaitingInstall && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px 0' }}>
          <StatusRow label="Bot app created" state="done" />
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Now install the app on <strong>{appOwner}</strong>…
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            Approve in the browser window that just opened. Make sure to grant access to the <strong>{config.github.repo}</strong> repository.
          </span>
          <button onClick={() => window.clauboy.openExternal(appInstallUrl).catch(console.error)} style={{ fontSize: '11px' }}>
            Reopen install page
          </button>
        </div>
      )}

      {botConfigured && !appWaitingInstall && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px 0' }}>
          <StatusRow label="Bot app created" state="done" />
          <StatusRow label="Bot app installed" state="done" />
        </div>
      )}

      {/* Manual fallback — only shown if auto-creation failed */}
      {error && !appCreating && !appWaitingInstall && (
        <details style={{ marginTop: '8px' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}>Enter credentials manually</summary>
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
            {botConfigured && (
              <button className="primary" onClick={onNext}>Next →</button>
            )}
          </div>
        </details>
      )}

      {/* Retry button if creation failed */}
      {error && !appCreating && !appWaitingInstall && !config.github.appId && (
        <button
          className="primary"
          onClick={() => onCreateApp(appOwner)}
          style={{ marginTop: '12px', width: '100%' }}
        >
          Retry Bot Setup
        </button>
      )}
    </div>
  )
}

export default function OnboardingApp(): React.ReactElement {
  const [step, setStep] = useState<Step>(1)
  const [config, setConfig] = useState<Config>(defaultConfig)
  const [error, setError] = useState<string>('')

  // Step 1 validation
  const [githubValidation, setGithubValidation] = useState<ValidationState>('idle')
  const [githubUser, setGithubUser] = useState<{ login: string; name: string | null } | null>(null)

  // Step 3 – GitHub App creation
  const [appCreating, setAppCreating] = useState(false)
  const [appWaitingInstall, setAppWaitingInstall] = useState(false)
  const [appInstallUrl, setAppInstallUrl] = useState('')

  // Step 2 – repo autocomplete
  const [repos, setRepos] = useState<Array<{ owner: string; name: string }>>([])

  // Step 4 – clone
  const [cloneStatus, setCloneStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [cloneProgress, setCloneProgress] = useState('')

  // Step 5 – docker
  const [dockerStatus, setDockerStatus] = useState<'idle' | 'checking' | 'pulling' | 'done' | 'error'>('idle')
  const [buildLogs, setBuildLogs] = useState<string[]>([])

  // Track whether user has passed through bot step (skipped or completed)
  const [botPassed, setBotPassed] = useState(false)

  // ── Validity computation (recalculated every render) ──
  const tokenValid = githubValidation === 'ok'
  const repoValid = tokenValid && !!config.github.owner && !!config.github.repo
  const botDone = repoValid && botPassed
  const cloneDone = botDone && cloneStatus === 'done'

  // maxReachable: highest 0-based tab index the user can navigate to
  let maxReachable = 0
  if (tokenValid) maxReachable = 1
  if (repoValid) maxReachable = 2
  if (botDone) maxReachable = 3
  if (cloneDone) maxReachable = 4

  // If user is on a step that's no longer valid, push them back
  useEffect(() => {
    const maxStep = (maxReachable + 1) as Step
    if (step > maxStep) setStep(maxStep)
  }, [maxReachable])

  // ── Navigation helper ──
  const goToStep = (s: Step): void => {
    setError('')
    setStep(s)
  }

  const advancePastBot = (): void => {
    setBotPassed(true)
    goToStep(4)
  }

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

  // Auto-clone when entering step 4 (only if not already done)
  useEffect(() => {
    if (step !== 4 || cloneStatus !== 'idle') return
    setCloneStatus('running')
    setCloneProgress('Starting…')
    window.clauboy.cloneRepo((msg) => setCloneProgress(msg))
      .then(() => { setCloneStatus('done'); setStep(5) })
      .catch((err: Error) => { setCloneStatus('error'); setError(String(err)) })
  }, [step])

  // Auto-advance past clone step if already done
  useEffect(() => {
    if (step === 4 && cloneStatus === 'done') setStep(5)
  }, [step, cloneStatus])

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
      ).then(() => { setDockerStatus('done'); void window.clauboy.completeOnboarding(config) })
    }).catch((err: Error) => { setDockerStatus('error'); setError(String(err)) })
  }, [step, dockerStatus])

  const updateGithub = (key: keyof Config['github'], value: string): void =>
    setConfig((c) => ({ ...c, github: { ...c.github, [key]: value } }))

  // Auto-validate token when it changes (debounced)
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!config.github.token) {
      setGithubValidation('idle')
      setGithubUser(null)
      setError('')
      return
    }
    setGithubValidation('loading')
    setError('')
    if (validateTimer.current) clearTimeout(validateTimer.current)
    validateTimer.current = setTimeout(() => {
      window.clauboy.validateGithubToken(config.github.token)
        .then((user) => {
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
          window.clauboy.listRepos(config.github.token).then(setRepos).catch(() => {})
        })
        .catch((err: Error) => {
          setGithubValidation('error')
          setError(`GitHub token invalid: ${String(err)}`)
        })
    }, 500)
    return () => { if (validateTimer.current) clearTimeout(validateTimer.current) }
  }, [config.github.token])

  const handleCreateApp = async (appOwner: string): Promise<void> => {
    setError('')
    setAppCreating(true)
    const isOrg = appOwner !== githubUser?.login
    try {
      const creds = await window.clauboy.createGithubApp(appOwner, isOrg)
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
          advancePastBot()
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

  const filteredRepos = repos.filter((r) => r.owner === config.github.owner)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <StepTabs
        steps={STEP_TITLES}
        current={step - 1}
        maxReachable={maxReachable}
        onSelect={(i) => goToStep((i + 1) as Step)}
      />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* ── Step 1: API Keys ── */}
        {step === 1 && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
              Create a GitHub PAT with <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>repo</code> and <code style={{ background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>read:org</code> scopes.
            </p>
            <button
              onClick={() => window.clauboy.openExternal('https://github.com/settings/tokens/new?description=Clauboy&scopes=repo,read:org').catch(console.error)}
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
                onChange={(e) => updateGithub('token', e.target.value)}
                placeholder="ghp_…"
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Repository ── */}
        {step === 2 && (
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

        {/* ── Step 3: GitHub Bot ── */}
        {step === 3 && (
          <BotSetupStep
            config={config}
            setConfig={setConfig}
            userLogin={githubUser?.login ?? ''}
            appCreating={appCreating}
            appWaitingInstall={appWaitingInstall}
            appInstallUrl={appInstallUrl}
            error={error}
            onCreateApp={(appOwner) => void handleCreateApp(appOwner)}
            onNext={advancePastBot}
            onSkip={advancePastBot}
          />
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
        {step > 1 && step <= 3 ? (
          <button onClick={() => goToStep((step - 1) as Step)}>
            ← Back
          </button>
        ) : (
          <div />
        )}

        {step === 1 && (
          <button className="primary" disabled={!tokenValid} onClick={() => goToStep(2)}>
            Next →
          </button>
        )}
        {step === 2 && (
          <button className="primary" disabled={!repoValid} onClick={() => goToStep(3)}>
            Next →
          </button>
        )}
        {(step === 3 || step === 4 || step === 5) && <div />}
      </div>
    </div>
  )
}
