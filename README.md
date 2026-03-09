# Clauboy

<img src="resources/logo.png" alt="Clauboy Logo" width="120" />

Orchestrate [Claude Code](https://github.com/anthropics/claude-code) agents in isolated Docker containers — one per GitHub Issue.

Add the `clauboy` label to any issue, and Clauboy spins up a container with a running Claude Code session, a dedicated git worktree, and a terminal UI to watch and interact with the agent.

---

## How it works

1. You add the `clauboy` label to a GitHub issue
2. Clauboy detects the label via polling (every 30s)
3. A git worktree is created for the issue branch
4. A Docker container launches with Claude Code + GitHub CLI
5. The agent starts working; you can watch the terminal live
6. When done, click **Teardown** — the container stops, worktree is removed, label switches to `clauboy:done`

GitHub is the single source of truth. All state is tracked via labels.

---

## Labels

| Label | Meaning |
|---|---|
| `clauboy` | Issue queued — agent will start |
| `clauboy:running` | Agent is active |
| `clauboy:done` | Work complete |
| `clauboy:paused` | Agent paused |
| `clauboy:error` | Something went wrong |

---

## Requirements

- Windows 10/11 (64-bit)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- A GitHub repository
- A GitHub Personal Access Token (scopes: `repo`, `issues`)
- An [Anthropic API Key](https://console.anthropic.com/)

---

## Setup

Run the app — the onboarding wizard walks you through:

1. **GitHub PAT** — token with `repo` + `issues` scopes
2. **GitHub App** (optional) — for bot comments on issues
3. **Repository** — owner, repo name, trusted user
4. **Clone** — Clauboy clones the repo locally for worktree management
5. **Docker** — checks Docker is running, builds the agent image
6. **Done** — open the dashboard

Config is stored at `~/.clauboy/config.yaml`. Tokens are encrypted with the OS keychain via Electron's `safeStorage`.

---

## Development

```bash
npm install
npm run dev       # Start Electron in dev mode
npm run build     # Build for production
npm run package   # Build + create Windows installer
```

### Stack

- **Electron 32** + **electron-vite 2**
- **TypeScript 5.5** (strict)
- **React 18** — all UI windows
- **dockerode** — Docker container management
- **@octokit/rest** + **@octokit/auth-app** — GitHub API
- **simple-git** — git worktree operations
- **@xterm/xterm** — terminal emulator
- **js-yaml** — config file

### Project structure

```
src/
├── shared/types.ts          # All shared types + IPC channel names
├── main/
│   ├── index.ts             # App lifecycle
│   ├── config.ts            # ~/.clauboy/config.yaml
│   ├── state.ts             # AppState singleton + broadcaster
│   ├── github.ts            # GitHub API wrapper
│   ├── docker.ts            # Docker container management
│   ├── worktree.ts          # Git worktree operations
│   ├── polling.ts           # 30s polling loop
│   ├── windows.ts           # BrowserWindow factory
│   └── ipc-handlers.ts      # All IPC registrations
├── preload/index.ts         # window.clauboy API
└── renderer/
    ├── dashboard/           # Issue list
    ├── agent/               # Terminal + toolbar
    ├── onboarding/          # 6-step setup wizard
    ├── settings/            # Config form
    └── button-editor/       # Drag & drop button editor
resources/
└── Dockerfile               # Agent image (node:24 + gh cli + claude-code)
i18n/
├── en.json
└── de.json
```

---

## Buttons

Each agent window has a configurable toolbar. Button types:

| Type | Action |
|---|---|
| `prompt` | Injects a predefined prompt into the agent terminal |
| `ide` | Opens the worktree in your editor |
| `web` | Opens a URL in the browser |
| `teardown` | Stops the agent and cleans up |

Prompt templates support variables: `{{ISSUE_NUMBER}}`, `{{ISSUE_URL}}`, `{{WORKTREE_PATH}}`. Note: `{{ISSUE_TITLE}}` and `{{ISSUE_BODY}}` are intentionally not supported — injecting untrusted issue content directly into the Claude session is a prompt-injection risk. The agent reads the issue via `gh issue view` instead.

Default buttons: **Start**, **Conceive**, **Document**, **PRs**, **IDE**, **Issue**, **Teardown**.

---

## Security

- Only predefined button prompts are injected into agent terminals
- Raw comment text and user input are never forwarded to the agent
- New comment activity triggers a neutral hint: *"There is new activity in issue #N. Please read the latest comments via GitHub CLI and decide how to respond."*
- Tokens are encrypted at rest using the OS keychain

---

## License

**Business Source License 1.1** — free for non-commercial use.

Commercial use requires a separate license. Contact [github.com/bartfastiel](https://github.com/bartfastiel) — typically granted for a symbolic €1 fee or free of charge, while the author retains all rights.

On 2030-01-01 the code will be re-licensed under Apache 2.0.

See [LICENSE](LICENSE) for full terms.
