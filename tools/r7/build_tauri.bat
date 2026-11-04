@echo off
call "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
set "PATH=C:\nodejs;C:\Users\user\.cargo\bin;%PATH%"
cd /d E:\pythonProjects\ai-ssh-pro
npm run build:tauri
