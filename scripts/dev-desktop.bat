@echo off
title AI-SSH-Pro Dev
cd /d "E:\pythonProjects\ai-ssh-pro"
if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
)
echo Starting AI-SSH-Pro from source (npm run dev)...
call npm run dev
if errorlevel 1 pause