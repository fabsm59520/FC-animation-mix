@echo off
chcp 65001 >nul
title Galactic DJ Dashboard
cd /d "%~dp0"
set PY=python
where python >nul 2>&1 || set PY=py
where %PY% >nul 2>&1 || (echo Python introuvable : installez-le depuis python.org & pause & exit /b)
echo Démarrage du serveur local...
start "" /b %PY% -m http.server 8000
timeout /t 2 /nobreak >nul
set "B="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "B=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined B if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "B=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined B if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "B=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined B if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "B=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined B if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "B=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if defined B goto app
start "" http://localhost:8000
goto fin
:app
start "" "%B%" --app=http://localhost:8000 --start-maximized
:fin
echo Le lecteur est ouvert. Fermez cette fenêtre pour arrêter le serveur.
pause
