#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Wenn der Launcher aus einem Electron-Host (VS Code, Claude Code, ...) gestartet
# wird, ist diese Var oft auf 1 gesetzt — Electron startet dann als Plain-Node
# und `require('electron')` liefert nur den Pfad-String. Resultat:
# `TypeError: Cannot read properties of undefined (reading 'isPackaged')`
# beim ersten Zugriff auf @electron-toolkit/utils. Hier explizit clearen.
unset ELECTRON_RUN_AS_NODE

LOGFILE="$HOME/.clauboy/launcher.log"
mkdir -p "$HOME/.clauboy"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"; }

abort() {
    log "============================================================"
    for line in "$@"; do log "$line"; done
    log "============================================================"
    read -p "Enter zum Schliessen..."
    exit 1
}

# Wenn ein vorheriger Launcher-Run einen Konflikt hinterlassen hat (z.B. weil
# 'git stash pop' upstream-geaenderte Dateien betrifft), bleibt der Worktree
# in einem halb-aufgeloesten Zustand. Spaetere Runs scheitern dann schon
# am 'git stash' im naechsten Anlauf, ohne dass der eigentliche Grund klar wird.
check_clean_worktree() {
    local stuck=""
    if [ -e .git/MERGE_HEAD ]; then stuck="Merge"
    elif [ -e .git/CHERRY_PICK_HEAD ]; then stuck="Cherry-Pick"
    elif [ -e .git/REBASE_HEAD ] || [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then stuck="Rebase"
    fi
    if [ -n "$stuck" ]; then
        abort "FEHLER: Worktree haengt in einem unaufgeloesten $stuck-State." \
              "" \
              "Bitte zuerst aufraeumen, dann Launcher erneut starten:" \
              "  cd \"$SCRIPT_DIR\"" \
              "  git status                # was haengt?" \
              "  git merge --abort         # falls Merge" \
              "  git rebase --abort        # falls Rebase" \
              "  git cherry-pick --abort   # falls Cherry-Pick"
    fi

    local unmerged
    unmerged=$(git diff --name-only --diff-filter=U)
    if [ -n "$unmerged" ]; then
        abort "FEHLER: Worktree hat ungeloeste Merge-Konflikte in:" \
              "$(echo "$unmerged" | sed 's/^/  /')" \
              "" \
              "Bitte Konflikte aufloesen, dann Launcher erneut starten:" \
              "  cd \"$SCRIPT_DIR\"" \
              "  # Konflikte manuell aufloesen" \
              "  git add <dateien>" \
              "  git stash drop            # falls noch ein Stash uebrig"
    fi
}

log "=============================================="
log "Clauboy Launcher gestartet"
log "=============================================="

log "Pre-flight: Worktree-Status pruefen..."
check_clean_worktree

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
# 'git stash pop' kann mit Konflikten zurueckkommen (rc!=0). Wir wollen das
# nicht via "|| true" verschlucken, sondern explizit pruefen — und zwar ueber
# den Worktree-Status, nicht ueber den Exit-Code (der auch fuer "kein stash
# vorhanden" benutzt wird).
git stash pop >> "$LOGFILE" 2>&1 || true
unmerged=$(git diff --name-only --diff-filter=U)
if [ -n "$unmerged" ]; then
    abort "FEHLER: 'git stash pop' hat einen Merge-Konflikt erzeugt." \
          "Lokale Aenderungen kollidieren mit den gerade gepullten Aenderungen." \
          "" \
          "Konfliktdateien:" \
          "$(echo "$unmerged" | sed 's/^/  /')" \
          "" \
          "Aufloesung (lokale Aenderungen behalten):" \
          "  cd \"$SCRIPT_DIR\"" \
          "  # Konflikte in den o.g. Dateien manuell aufloesen" \
          "  git add <dateien>" \
          "  git stash drop" \
          "" \
          "Aufloesung (lokale Aenderungen verwerfen, upstream uebernehmen):" \
          "  cd \"$SCRIPT_DIR\"" \
          "  git checkout --theirs -- <dateien>" \
          "  git add <dateien>" \
          "  git stash drop"
fi

# npm install + start
log "npm install..."
npm install >> "$LOGFILE" 2>&1

log "npm run dev..."
npm run dev 2>&1 | tee -a "$LOGFILE"

log "Beendet mit code $?"
read -p "Enter zum Schliessen..."
