import * as http from 'http'
import { shell } from 'electron'
import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'

export interface AppCredentials {
  appId: string
  privateKey: string
  installUrl: string
  slug: string
}

export async function createGithubAppViaManifest(owner: string, isOrg = false): Promise<AppCredentials> {
  return new Promise((resolve, reject) => {
    let server: http.Server | null = null
    let resolved = false

    const finish = (err?: Error, value?: AppCredentials): void => {
      if (resolved) return
      resolved = true
      server?.close()
      server = null
      if (err) reject(err)
      else resolve(value!)
    }

    // For orgs, use the org-specific endpoint; for personal accounts, use the user endpoint
    const formAction = isOrg
      ? `https://github.com/organizations/${owner}/settings/apps/new`
      : `https://github.com/settings/apps/new`

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (url.pathname === '/') {
        const port = (server!.address() as { port: number }).port
        const manifest = JSON.stringify({
          name: `Clauboy Bot (${owner})`,
          url: 'https://github.com/bartfastiel/clauboy',
          hook_attributes: { url: 'https://example.com/placeholder', active: false },
          redirect_url: `http://localhost:${port}/callback`,
          public: false,
          default_permissions: {
            contents: 'write',
            issues: 'write',
            pull_requests: 'write',
            actions: 'write',
            workflows: 'write',
            metadata: 'read'
          }
        })

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!DOCTYPE html>
<html>
<body style="background:#1a1a1a;color:#e8e8e8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <div style="font-size:48px">🤠</div>
    <p>Opening GitHub to create your Clauboy Bot app on <strong>${owner}</strong>…</p>
    <form id="f" method="post" action="${formAction}">
      <input type="hidden" name="manifest" value="${manifest.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}">
    </form>
    <script>document.getElementById('f').submit();</script>
  </div>
</body>
</html>`)
      } else if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!DOCTYPE html>
<html>
<body style="background:#1a1a1a;color:#e8e8e8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <div style="font-size:48px">✅</div>
    <p>GitHub App created! You can close this tab and return to Clauboy.</p>
  </div>
</body>
</html>`)

        if (!code) { finish(new Error('No code returned from GitHub')); return }

        fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
          method: 'POST',
          headers: { Accept: 'application/vnd.github+json' }
        })
          .then((r) => r.json())
          .then((data: Record<string, unknown>) => {
            if (!data.id) throw new Error(String(data.message ?? 'Unknown error from GitHub'))
            finish(undefined, {
              appId: String(data.id),
              privateKey: String(data.pem),
              installUrl: `https://github.com/apps/${data.slug}/installations/new`,
              slug: String(data.slug)
            })
          })
          .catch((err: Error) => finish(err))
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const port = (server!.address() as { port: number }).port
      shell.openExternal(`http://localhost:${port}/`).catch(reject)
    })

    server.on('error', (err) => finish(err))

    // Timeout after 10 minutes
    setTimeout(() => finish(new Error('Timed out waiting for GitHub App creation')), 10 * 60 * 1000)
  })
}

export async function getInstallationId(
  appId: string,
  privateKey: string,
  owner: string
): Promise<string | null> {
  try {
    const oc = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: parseInt(appId, 10), privateKey }
    })
    const { data } = await oc.apps.listInstallations({ per_page: 100 })
    const match = data.find((i) => i.account?.login?.toLowerCase() === owner.toLowerCase())
    return match ? String(match.id) : null
  } catch {
    return null
  }
}
