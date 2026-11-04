@echo off
call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat
set "PATH=C:\Users\user\.cargo\bin;C:\nodejs;E:\pythonProjects\ai-ssh-pro\node_modules\.bin;C:\Windows\System32;C:\Windows;C:\Program Files\Git\cmd;%PATH%"
cd /d E:\pythonProjects\ai-ssh-pro
call npm.cmd run build:web
if errorlevel 1 exit /b 1
cargo tauri build
exit /b %ERRORLEVEL%
