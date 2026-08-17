' Launch AI-SSH-Pro without a console window.
' Uses node launcher (direct Electron on out/), not "npm run preview".
' Resolves paths relative to this script so it is portable across machines.
Option Explicit
Dim sh, fso, scriptDir, root, nodeCmd, launcher, pathEnv, parts, i, cand
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptDir)
sh.CurrentDirectory = root
launcher = scriptDir & "\launch-ai-ssh-pro.mjs"

nodeCmd = ""
On Error Resume Next
nodeCmd = sh.RegRead("HKLM\SOFTWARE\Node.js\InstallPath")
If Err.Number <> 0 Then
  Err.Clear
  nodeCmd = sh.RegRead("HKCU\SOFTWARE\Node.js\InstallPath")
End If
On Error GoTo 0
If nodeCmd <> "" Then
  If Right(nodeCmd, 1) <> "\" Then nodeCmd = nodeCmd & "\"
  nodeCmd = nodeCmd & "node.exe"
  If Not fso.FileExists(nodeCmd) Then nodeCmd = ""
End If

If nodeCmd = "" Then
  pathEnv = sh.ExpandEnvironmentStrings("%PATH%")
  parts = Split(pathEnv, ";")
  For i = 0 To UBound(parts)
    cand = Trim(parts(i))
    If cand <> "" Then
      If Right(cand, 1) <> "\" Then cand = cand & "\"
      cand = cand & "node.exe"
      If fso.FileExists(cand) Then
        nodeCmd = cand
        Exit For
      End If
    End If
  Next
End If

If nodeCmd = "" Or Not fso.FileExists(launcher) Then
  MsgBox "Cannot find node.exe or launch-ai-ssh-pro.mjs." & vbCrLf & "Install Node.js and keep this script under scripts/.", vbExclamation, "AI-SSH-Pro"
  WScript.Quit 1
End If

sh.Run Chr(34) & nodeCmd & Chr(34) & " " & Chr(34) & launcher & Chr(34), 0, False
