@echo off
title Clauboy Launcher
cd /d "%~dp0"

rem Wenn der Launcher aus einem Electron-Host (VS Code, Claude Code, ...)
rem gestartet wird, ist diese Var oft auf 1 - Electron startet dann als
rem Plain-Node und require('electron') liefert nur den Pfad-String:
rem TypeError: Cannot read properties of undefined (reading 'isPackaged').
set "ELECTRON_RUN_AS_NODE="

set LOGFILE=%USERPROFILE%\.clauboy\launcher.log
if not exist "%USERPROFILE%\.clauboy" mkdir "%USERPROFILE%\.clauboy"

echo ============================================== >> "%LOGFILE%"
echo [%date% %time%] Clauboy Launcher gestartet >> "%LOGFILE%"
echo ============================================== >> "%LOGFILE%"

rem ================================================================
rem Pre-flight: Worktree muss sauber sein. Ein vorheriger Launcher-
rem Run kann bei Stash-Pop-Konflikten halb-aufgeloesten State
rem hinterlassen - den fangen wir hier ab, bevor das naechste
rem 'git stash' an genau diesem State scheitert.
rem ================================================================
echo [Clauboy] Pre-flight: Worktree-Status pruefen...
echo [%date% %time%] Pre-flight: Worktree-Status pruefen >> "%LOGFILE%"

set "STUCK_STATE="
if exist ".git\MERGE_HEAD"        set "STUCK_STATE=Merge"
if exist ".git\CHERRY_PICK_HEAD"  set "STUCK_STATE=Cherry-Pick"
if exist ".git\REBASE_HEAD"       set "STUCK_STATE=Rebase"
if exist ".git\rebase-merge"      set "STUCK_STATE=Rebase"
if exist ".git\rebase-apply"      set "STUCK_STATE=Rebase"

if defined STUCK_STATE (
    echo [Clauboy] ============================================================
    echo [Clauboy] FEHLER: Worktree haengt in einem unaufgeloesten %STUCK_STATE%-State.
    echo [Clauboy].
    echo [Clauboy] Bitte zuerst aufraeumen, dann Launcher erneut starten:
    echo [Clauboy]   cd "%~dp0"
    echo [Clauboy]   git status
    echo [Clauboy]   git merge --abort         ^(falls Merge^)
    echo [Clauboy]   git rebase --abort        ^(falls Rebase^)
    echo [Clauboy]   git cherry-pick --abort   ^(falls Cherry-Pick^)
    echo [Clauboy] ============================================================
    echo [%date% %time%] FEHLER: %STUCK_STATE%-State im Worktree >> "%LOGFILE%"
    pause
    exit /b 1
)

set "UNMERGED_FILE=%TEMP%\clauboy-unmerged.txt"
set "UNMERGED_SIZE=0"
git diff --name-only --diff-filter=U > "%UNMERGED_FILE%" 2>nul
for %%A in ("%UNMERGED_FILE%") do set "UNMERGED_SIZE=%%~zA"
if "%UNMERGED_SIZE%"=="" set "UNMERGED_SIZE=0"
if not "%UNMERGED_SIZE%"=="0" (
    echo [Clauboy] ============================================================
    echo [Clauboy] FEHLER: Worktree hat ungeloeste Merge-Konflikte in:
    type "%UNMERGED_FILE%"
    echo [Clauboy].
    echo [Clauboy] Bitte Konflikte aufloesen, dann Launcher erneut starten:
    echo [Clauboy]   cd "%~dp0"
    echo [Clauboy]   ^(Konflikte manuell aufloesen^)
    echo [Clauboy]   git add ^<dateien^>
    echo [Clauboy]   git stash drop            ^(falls noch ein Stash uebrig^)
    echo [Clauboy] ============================================================
    echo [%date% %time%] FEHLER: unmerged paths im Worktree >> "%LOGFILE%"
    type "%UNMERGED_FILE%" >> "%LOGFILE%"
    del "%UNMERGED_FILE%" 2>nul
    pause
    exit /b 1
)
del "%UNMERGED_FILE%" 2>nul

echo [Clauboy] Bestehende Instanzen beenden...
echo [%date% %time%] Killing existing processes... >> "%LOGFILE%"
rem Nur electron.exe-Prozesse killen, deren Pfad in node_modules\electron\dist
rem dieses Repos liegt - sonst trifft "Clauboy*"-Window-Title z.B. VS Code mit
rem dem Clauboy-Workspace und killt das gleich mit.
for /f "tokens=*" %%p in ('powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '%~dp0node_modules\electron\dist\*' } | Select-Object -ExpandProperty Id"') do (
    echo [%date% %time%] Killing PID %%p >> "%LOGFILE%"
    taskkill /f /pid %%p >> "%LOGFILE%" 2>&1
)

echo [Clauboy] Git stash + pull --rebase (main)...
echo [%date% %time%] git stash >> "%LOGFILE%"
call git stash --include-untracked >> "%LOGFILE%" 2>&1

echo [%date% %time%] git checkout main >> "%LOGFILE%"
call git checkout main >> "%LOGFILE%" 2>&1

echo [%date% %time%] git pull --rebase >> "%LOGFILE%"
call git pull --rebase >> "%LOGFILE%" 2>&1
if %errorlevel% neq 0 (
    echo [Clauboy] FEHLER: git pull fehlgeschlagen! Siehe %LOGFILE%
    echo [%date% %time%] FEHLER: git pull >> "%LOGFILE%"
    pause
    exit /b 1
)

echo [%date% %time%] git stash pop >> "%LOGFILE%"
call git stash pop >> "%LOGFILE%" 2>&1

rem 'git stash pop' kann mit Konflikten enden - Exit-Code dann ungleich 0,
rem aber das deckt auch den "kein stash vorhanden"-Fall ab. Pruefen ueber
rem den Worktree-Status ist eindeutig.
set "UNMERGED_SIZE=0"
git diff --name-only --diff-filter=U > "%UNMERGED_FILE%" 2>nul
for %%A in ("%UNMERGED_FILE%") do set "UNMERGED_SIZE=%%~zA"
if "%UNMERGED_SIZE%"=="" set "UNMERGED_SIZE=0"
if not "%UNMERGED_SIZE%"=="0" (
    echo [Clauboy] ============================================================
    echo [Clauboy] FEHLER: 'git stash pop' hat einen Merge-Konflikt erzeugt.
    echo [Clauboy] Lokale Aenderungen kollidieren mit den gerade gepullten.
    echo [Clauboy].
    echo [Clauboy] Konfliktdateien:
    type "%UNMERGED_FILE%"
    echo [Clauboy].
    echo [Clauboy] Aufloesung ^(lokale Aenderungen behalten^):
    echo [Clauboy]   cd "%~dp0"
    echo [Clauboy]   ^(Konflikte manuell aufloesen^)
    echo [Clauboy]   git add ^<dateien^>
    echo [Clauboy]   git stash drop
    echo [Clauboy].
    echo [Clauboy] Aufloesung ^(lokale Aenderungen verwerfen, upstream nehmen^):
    echo [Clauboy]   git checkout --theirs -- ^<dateien^>
    echo [Clauboy]   git add ^<dateien^>
    echo [Clauboy]   git stash drop
    echo [Clauboy] ============================================================
    echo [%date% %time%] FEHLER: stash-pop-Konflikt >> "%LOGFILE%"
    type "%UNMERGED_FILE%" >> "%LOGFILE%"
    del "%UNMERGED_FILE%" 2>nul
    pause
    exit /b 1
)
del "%UNMERGED_FILE%" 2>nul

echo [Clauboy] npm install...
echo [%date% %time%] npm install >> "%LOGFILE%"
call npm install >> "%LOGFILE%" 2>&1

echo [Clauboy] Starte Clauboy...
echo [%date% %time%] npm run dev >> "%LOGFILE%"
call npm run dev
echo [%date% %time%] beendet mit code %errorlevel% >> "%LOGFILE%"
pause
