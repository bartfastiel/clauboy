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

# Clone repo into /workspace if empty
if [ -z "$(ls -A /workspace 2>/dev/null)" ] && [ -n "$GITHUB_OWNER" ] && [ -n "$GITHUB_REPO" ]; then
    echo "[clauboy] Cloning ${GITHUB_OWNER}/${GITHUB_REPO}..."
    git clone "https://${GH_TOKEN}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git" /workspace
    echo "[clauboy] Clone complete"
fi

# Checkout or create issue branch
if [ -n "$ISSUE_NUMBER" ] && [ -d "/workspace/.git" ]; then
    cd /workspace
    git fetch origin "issue-${ISSUE_NUMBER}" 2>/dev/null \
        && git checkout "issue-${ISSUE_NUMBER}" \
        || git checkout -b "issue-${ISSUE_NUMBER}"
    echo "[clauboy] Checked out branch issue-${ISSUE_NUMBER}"
fi

# Start tmux session with Claude if not already running
if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "[clauboy] Resuming existing tmux session: $SESSION"
else
    echo "[clauboy] Creating new tmux session: $SESSION"
    tmux new-session -d -s "$SESSION" -x 220 -y 50
    sleep 0.3
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
    -t 'theme={"background":"#1a1a2e","foreground":"#e0e0e0","cursor":"#00ff88"}' \
    tmux attach-session -t "$SESSION"
