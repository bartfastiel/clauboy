#!/bin/bash
set -e

SESSION="claude-agent"

echo "[clauboy] Starting agent container for issue #${ISSUE_NUMBER}..."

# Restore ~/.claude.json from backup if missing (same approach as claude-code-docker)
if [ ! -f /home/agent/.claude.json ]; then
    BACKUP=$(ls -S /home/agent/.claude/backups/.claude.json.backup.* 2>/dev/null | head -1)
    if [ -n "$BACKUP" ]; then
        cp "$BACKUP" /home/agent/.claude.json
        echo "[clauboy] Restored ~/.claude.json from backup: $(basename $BACKUP)"
    fi
fi

# Write token to file so it can be refreshed by the host without restarting the container.
# The git credential helper and gh CLI both read from this file on every invocation.
echo "$GH_TOKEN" > /tmp/.gh_token

# Configure git credential helper to read token from file (supports live refresh)
git config --global credential.helper '!f() { echo username=x-access-token; echo "password=$(cat /tmp/.gh_token)"; }; f'

# Authenticate gh CLI from the token file (so gh issue/pr/comment work as bot)
gh auth login --with-token < /tmp/.gh_token 2>/dev/null || true

# Unset GH_TOKEN so gh CLI uses the stored auth token (from gh auth login) instead
# of the env var.  The env var is a one-shot bootstrap value that expires after ~1h
# for GitHub App installation tokens.  The host refreshes /tmp/.gh_token + gh auth
# periodically, but cannot update a running process's env vars — so we must not let
# gh read from one.
unset GH_TOKEN

# Clone repo into /workspace (shallow clone for speed + isolation)
if [ -z "$(ls -A /workspace 2>/dev/null)" ] && [ -n "$GITHUB_OWNER" ] && [ -n "$GITHUB_REPO" ]; then
    echo "[clauboy] Cloning ${GITHUB_OWNER}/${GITHUB_REPO} (shallow)..."
    git clone --depth 1 "https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git" /workspace
    echo "[clauboy] Clone complete"
fi

# Checkout or create issue branch
if [ -n "$ISSUE_NUMBER" ] && [ -e "/workspace/.git" ]; then
    cd /workspace
    # Unshallow enough to branch off; fetch the issue branch if it exists remotely
    git fetch --unshallow 2>/dev/null || true
    git fetch origin "issue-${ISSUE_NUMBER}" 2>/dev/null || true
    git checkout "issue-${ISSUE_NUMBER}" 2>/dev/null \
        || git checkout -b "issue-${ISSUE_NUMBER}"
    echo "[clauboy] Checked out branch issue-${ISSUE_NUMBER}"
fi

# Inject dev-port instructions into workspace CLAUDE.md so the agent knows which ports to use
if [ -n "$DEV_PORTS" ] && [ -n "$DEV_PORTS_HOST_BASE" ]; then
    DEV_BLOCK="

# Dev Server Ports
When starting dev/test servers, use ports ${DEV_PORTS} (e.g. 3000).
These are mapped to the host — the user can access them in their browser.
Port mapping: container port 3000+N → host http://localhost:\$((DEV_PORTS_HOST_BASE + N))
Example: port 3000 → http://localhost:${DEV_PORTS_HOST_BASE}
         port 3001 → http://localhost:$((DEV_PORTS_HOST_BASE + 1))
Always tell the user the host URL when you start a server."
    if [ -f /workspace/CLAUDE.md ]; then
        # Append only if not already present
        if ! grep -q "Dev Server Ports" /workspace/CLAUDE.md; then
            echo "$DEV_BLOCK" >> /workspace/CLAUDE.md
        fi
    else
        echo "$DEV_BLOCK" > /workspace/CLAUDE.md
    fi
fi

# Start tmux session with Claude if not already running
if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "[clauboy] Resuming existing tmux session: $SESSION"
else
    echo "[clauboy] Creating new tmux session: $SESSION"
    tmux new-session -d -s "$SESSION" -x 220 -y 50
    sleep 0.3
    # Set browser tab title via OSC escape sequence (works with xterm.js/ttyd)
    TITLE="#${ISSUE_NUMBER}"
    [ -n "$ISSUE_TITLE" ] && TITLE="#${ISSUE_NUMBER}: ${ISSUE_TITLE}"
    tmux send-keys -t "$SESSION" "printf '\\033]0;${TITLE}\\007'" Enter
    sleep 0.1
    tmux send-keys -t "$SESSION" "cd /workspace && claude --dangerously-skip-permissions" Enter
    # Auto-accept the bypass-permissions warning by polling until the prompt appears
    for i in $(seq 1 30); do
        sleep 1
        PANE=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null || true)
        if echo "$PANE" | grep -q "Yes, I accept"; then
            tmux send-keys -t "$SESSION" Down Enter
            break
        fi
    done
fi

echo "[clauboy] Starting ttyd on port 7681..."
exec ttyd \
    -p 7681 \
    --writable \
    -t fontSize=14 \
    -t rendererType=canvas \
    -t allowTitleChange=true \
    -t 'theme={"background":"#1a1a2e","foreground":"#e0e0e0","cursor":"#00ff88"}' \
    tmux attach-session -t "$SESSION"
