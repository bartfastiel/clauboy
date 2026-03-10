# Changelog

## 0.2.0

### Features
- **Mandatory GitHub Bot**: Bot setup is now required during onboarding — auto-starts creation flow, no manual steps needed. Agents always act as the bot account.
- **Prompt input bar**: Send text directly to the Claude Code terminal from the agent window.
- **Live agent activity**: Dashboard shows per-issue status (working / waiting for input) with live elapsed time, polled every 3 seconds via Docker.
- **Dashboard sorting**: Sort issues by last updated, issue number, status, or activity.
- **Issue filter**: Search/filter issues in the dashboard with highlighted active filter.
- **Auto-refresh**: Issues refresh every 5 minutes and on window focus (if >30s stale).
- **Config broadcast**: Button edits and config changes apply instantly across all windows.
- **Repo in title**: Dashboard window title shows `Clauboy – owner/repo`.
- **Agent window titles**: OS window title shows `#number – title` for each agent.
- **Open in browser**: Button to open the terminal in an external browser.
- **Auth terminal**: Quick access to `claude auth login` from agent toolbar.

### Improvements
- **Token refresh**: GitHub App installation tokens refresh automatically every 45 minutes via `tmux set-environment`.
- **Terminal stability**: Eliminated flicker when opening agent windows (CSS injection hides content during xterm.js init).
- **Scrollbar suppression**: No scrollbars in the embedded terminal webview.
- **Prompt injection safety**: Issue title/body are never injected into Claude sessions. Saved button prompts are migrated on load.
- **EPIPE handling**: Global handler prevents crash popups from broken pipes.
- **Rate limit backoff**: GitHub API 403 responses trigger a 5-minute backoff.
- **Removed pause/resume**: Feature removed — was not useful.
- **Removed comment-check loop**: Reduces GitHub API usage significantly.
- **Simplified settings**: Bot tab shows status instead of raw credential fields.

### Fixes
- Agent windows auto-focus terminal on load
- Docker state reconciliation on every poll tick
- Worktree cleanup on teardown
- Post-teardown issue list refresh
- Git clone uses `x-access-token` prefix for GitHub App tokens
- Entrypoint polls for permission accept instead of sleeping

## 0.1.0

Initial release.
