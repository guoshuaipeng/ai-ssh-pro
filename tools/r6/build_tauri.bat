@echo off
call "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
REM Ensure node/cargo ahead; keep MSVC link ahead of Git usr\bin
set "PATH=C:\nodejs;C:\Users\user\.cargo\bin;%PATH%"
cd /d E:\pythonProjects\ai-ssh-pro
where link
where cl
npm run build:tauri
