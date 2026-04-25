@echo off
title Clauboy Launcher
cd /d "%~dp0"

set LOGFILE=%USERPROFILE%\.clauboy\launcher.log
if not exist "%USERPROFILE%\.clauboy" mkdir "%USERPROFILE%\.clauboy"

echo ============================================== >> "%LOGFILE%"
echo [%date% %time%] Clauboy Launcher gestartet >> "%LOGFILE%"
echo ============================================== >> "%LOGFILE%"

echo [Clauboy] Bestehende Instanzen beenden...
echo [%date% %time%] Killing existing processes... >> "%LOGFILE%"
rem Nur electron.exe-Prozesse killen, deren Pfad in node_modules\electron\dist
rem dieses Repos liegt — sonst trifft "Clauboy*"-Window-Title z.B. VS Code mit
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

echo [Clauboy] npm install...
echo [%date% %time%] npm install >> "%LOGFILE%"
call npm install >> "%LOGFILE%" 2>&1

echo [Clauboy] Starte Clauboy...
echo [%date% %time%] npm run dev >> "%LOGFILE%"
call npm run dev
echo [%date% %time%] beendet mit code %errorlevel% >> "%LOGFILE%"
pause
