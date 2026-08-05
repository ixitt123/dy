Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
logFile = base & "\.data\launcher.log"

Sub LogLine(message)
  On Error Resume Next
  If Not fso.FolderExists(base & "\.data") Then fso.CreateFolder(base & "\.data")
  Set log = fso.OpenTextFile(logFile, 8, True)
  log.WriteLine Now & " " & message
  log.Close
  On Error GoTo 0
End Sub

Function IsConsoleHost()
  IsConsoleHost = (LCase(fso.GetFileName(WScript.FullName)) = "cscript.exe")
End Function

Sub FailAndQuit(message, exitCode)
  LogLine "ERROR: " & message
  If IsConsoleHost() Then
    WScript.StdErr.WriteLine message
  Else
    shell.Popup message, 15, "Short Video Workbench - Startup Error", 16
  End If
  WScript.Quit exitCode
End Sub

Function FindNode()
  configuredNode = Trim(shell.ExpandEnvironmentStrings("%DOUYIN_LAUNCHER_NODE%"))
  If configuredNode <> "" And configuredNode <> "%DOUYIN_LAUNCHER_NODE%" Then
    FindNode = configuredNode
    Exit Function
  End If

  candidates = Array( _
    shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\nodejs\node.exe" _
  )

  For Each candidate In candidates
    If fso.FileExists(candidate) Then
      FindNode = candidate
      Exit Function
    End If
  Next

  tempFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\douyin-video-tool-node-path.txt"
  shell.Run "cmd.exe /d /c where node > """ & tempFile & """ 2>nul", 0, True
  If fso.FileExists(tempFile) Then
    Set file = fso.OpenTextFile(tempFile, 1, False)
    If Not file.AtEndOfStream Then
      line = Trim(file.ReadLine)
      If line <> "" Then FindNode = line
    End If
    file.Close
    On Error Resume Next
    fso.DeleteFile tempFile, True
    On Error GoTo 0
  End If
End Function

nodePath = FindNode()
If nodePath = "" Or Not fso.FileExists(nodePath) Then
  FailAndQuit "Node.js was not found. Install the supported Node.js version, then run pnpm install.", 1
End If

packagePath = base & "\node_modules\@yc-w-cn\douyin-mcp-server\package.json"
If Not fso.FileExists(packagePath) Then
  FailAndQuit "Dependencies are missing. Run pnpm install before launching the workbench.", 2
End If

launcherPath = base & "\launch-ui.mjs"
If Not fso.FileExists(launcherPath) Then
  FailAndQuit "The launch-ui.mjs startup entry is missing. Restore the application files before launching.", 3
End If

cmd = """" & nodePath & """ """ & launcherPath & """"
shell.CurrentDirectory = base
LogLine "Launching UI in hidden mode."
exitCode = shell.Run(cmd, 0, True)
If exitCode <> 0 Then
  FailAndQuit "The UI launcher failed with exit code " & exitCode & ". Check .data\launcher.log and restore missing dependencies or application files.", exitCode
End If
LogLine "UI launcher completed successfully."
