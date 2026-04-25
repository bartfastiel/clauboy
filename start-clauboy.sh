#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOGFILE="$HOME/.clauboy/launcher.log"
mkdir -p "$HOME/.clauboy"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"; }

log "=============================================="
log "Clauboy Launcher gestartet"
log "=============================================="

# Kill bestehende Clauboy-Prozesse (nur die aus diesem Projekt).
# Filtert auf electron.exe-Prozesse, deren Pfad in node_modules/electron/dist
# dieses Repos liegt — verhindert, dass z.B. VS Code (auch Electron) mit
# "clauboy" im Fenstertitel mitgekillt wird.
log "Bestehende Instanzen beenden..."
ELECTRON_DIR_WIN=$(cygpath -w "$SCRIPT_DIR/node_modules/electron/dist")
pids=$(powershell.exe -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { \$_.Path -like '$ELECTRON_DIR_WIN\\*' } | Select-Object -ExpandProperty Id" 2>/dev/null | tr -d '\r')
for pid in $pids; do
    log "Killing PID $pid"
    taskkill.exe //f //pid "$pid" >> "$LOGFILE" 2>&1 || true
done

# Git: stash, checkout main, pull
log "git stash..."
git stash --include-untracked >> "$LOGFILE" 2>&1 || true

log "git checkout main..."
git checkout main >> "$LOGFILE" 2>&1

log "git pull --rebase..."
git pull --rebase >> "$LOGFILE" 2>&1

log "git stash pop..."
git stash pop >> "$LOGFILE" 2>&1 || true

# npm install + start
log "npm install..."
npm install >> "$LOGFILE" 2>&1

log "npm run dev..."
npm run dev 2>&1 | tee -a "$LOGFILE"

log "Beendet mit code $?"
read -p "Enter zum Schliessen..."
