param(
  [string]$ExePath = ""
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if (-not $ExePath -or -not (Test-Path $ExePath)) {
  $ExePath = Join-Path $repo "src-tauri\target\release\ai-ssh-pro.exe"
}
if (-not (Test-Path $ExePath)) {
  Write-Error "Release exe not found: $ExePath — run npm run build:tauri first"
}
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "AI-SSH-Pro 最新版.lnk"
$w = New-Object -ComObject WScript.Shell
$sc = $w.CreateShortcut($lnkPath)
$sc.TargetPath = (Resolve-Path $ExePath).Path
$sc.WorkingDirectory = Split-Path -Parent $sc.TargetPath
$sc.WindowStyle = 1
$sc.Description = "AI-SSH-Pro — always points at current release build output"
$sc.Save()
Write-Host "Shortcut: $lnkPath"
Write-Host "Target:   $($sc.TargetPath)"
