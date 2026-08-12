Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
dataDir = base & "\.data"
logFile = dataDir & "\launcher.log"
lockDir = dataDir & "\launcher-log.lock"
Set processEnv = shell.Environment("PROCESS")

Function EnvironmentInteger(name, fallback, minimum, maximum)
  rawValue = Trim(CStr(processEnv(name)))
  If IsNumeric(rawValue) Then
    parsedValue = CLng(rawValue)
    If parsedValue >= minimum And parsedValue <= maximum Then
      EnvironmentInteger = parsedValue
      Exit Function
    End If
  End If
  EnvironmentInteger = fallback
End Function

logMaxBytes = EnvironmentInteger("DOUYIN_LAUNCHER_LOG_MAX_BYTES", 262144, 512, 10485760)
logBackups = EnvironmentInteger("DOUYIN_LAUNCHER_LOG_BACKUPS", 3, 0, 20)
logLockStaleMs = EnvironmentInteger("DOUYIN_LAUNCHER_LOG_LOCK_STALE_MS", 30000, 100, 300000)
runId = Trim(CStr(processEnv("DOUYIN_LAUNCHER_RUN_ID")))
If runId = "" Then
  Randomize
  runId = "vbs-" & Replace(Replace(Replace(CStr(Now), "/", ""), ":", ""), " ", "-") & "-" & CStr(Int(Rnd * 1000000))
  processEnv("DOUYIN_LAUNCHER_RUN_ID") = runId
End If

Function PadNumber(value, width)
  PadNumber = Right(String(width, "0") & CStr(value), width)
End Function

Function IsoTimestamp()
  current = Now
  milliseconds = Int((Timer - Int(Timer)) * 1000)
  IsoTimestamp = Year(current) & "-" & PadNumber(Month(current), 2) & "-" & PadNumber(Day(current), 2) & _
    "T" & PadNumber(Hour(current), 2) & ":" & PadNumber(Minute(current), 2) & ":" & PadNumber(Second(current), 2) & _
    "." & PadNumber(milliseconds, 3)
End Function

Function JsonEscape(value)
  textValue = CStr(value)
  escaped = ""
  For charIndex = 1 To Len(textValue)
    character = Mid(textValue, charIndex, 1)
    charCode = AscW(character)
    If charCode < 0 Then charCode = charCode + 65536
    If character = Chr(34) Then
      escaped = escaped & "\" & Chr(34)
    ElseIf character = "\" Then
      escaped = escaped & "\\"
    ElseIf charCode = 8 Then
      escaped = escaped & "\b"
    ElseIf charCode = 9 Then
      escaped = escaped & "\t"
    ElseIf charCode = 10 Then
      escaped = escaped & "\n"
    ElseIf charCode = 12 Then
      escaped = escaped & "\f"
    ElseIf charCode = 13 Then
      escaped = escaped & "\r"
    ElseIf charCode >= 32 And charCode <= 126 Then
      escaped = escaped & character
    Else
      escaped = escaped & "\u" & Right("0000" & Hex(charCode), 4)
    End If
  Next
  JsonEscape = escaped
End Function

Function ReadCurrentUrl()
  ReadCurrentUrl = ""
  urlFile = base & "\ui-server.url"
  On Error Resume Next
  If fso.FileExists(urlFile) Then
    Set urlReader = fso.OpenTextFile(urlFile, 1, False)
    If Err.Number = 0 And Not urlReader.AtEndOfStream Then ReadCurrentUrl = Trim(urlReader.ReadLine)
    urlReader.Close
  End If
  On Error GoTo 0
End Function

Function AcquireLogLock()
  AcquireLogLock = False
  For lockAttempt = 1 To 200
    On Error Resume Next
    Err.Clear
    If Not fso.FolderExists(dataDir) Then fso.CreateFolder dataDir
    Err.Clear
    fso.CreateFolder lockDir
    If Err.Number = 0 Then
      AcquireLogLock = True
      On Error GoTo 0
      Exit Function
    End If
    Err.Clear
    If fso.FolderExists(lockDir) Then
      Set currentLock = fso.GetFolder(lockDir)
      If Err.Number = 0 Then
        lockAgeMs = DateDiff("s", currentLock.DateLastModified, Now) * 1000
        If lockAgeMs > logLockStaleMs Then
          Err.Clear
          fso.DeleteFolder lockDir, True
        End If
      End If
    End If
    On Error GoTo 0
    WScript.Sleep 15
  Next
End Function

Sub ReleaseLogLock()
  On Error Resume Next
  If fso.FolderExists(lockDir) Then fso.DeleteFolder lockDir, True
  On Error GoTo 0
End Sub

Function RotateLogsIfNeeded(nextBytes)
  RotateLogsIfNeeded = True
  On Error Resume Next
  currentBytes = 0
  If fso.FileExists(logFile) Then currentBytes = fso.GetFile(logFile).Size
  If currentBytes + nextBytes > logMaxBytes And currentBytes > 0 Then
    If logBackups = 0 Then
      fso.DeleteFile logFile, True
    Else
      For backupIndex = logBackups To 1 Step -1
        If backupIndex = 1 Then
          backupSource = logFile
        Else
          backupSource = logFile & "." & CStr(backupIndex - 1)
        End If
        backupTarget = logFile & "." & CStr(backupIndex)
        If fso.FileExists(backupSource) Then
          If fso.FileExists(backupTarget) Then fso.DeleteFile backupTarget, True
          fso.MoveFile backupSource, backupTarget
        End If
      Next
    End If
  End If
  If Err.Number <> 0 Then RotateLogsIfNeeded = False
  On Error GoTo 0
End Function

Function LogEvent(eventName, pidValue, urlValue, message)
  LogEvent = False
  If Not AcquireLogLock() Then Exit Function

  If Trim(CStr(urlValue)) = "" Then
    jsonUrl = "null"
  Else
    jsonUrl = Chr(34) & JsonEscape(urlValue) & Chr(34)
  End If
  jsonLine = "{""timestamp"":""" & JsonEscape(IsoTimestamp()) & """,""event"":""" & JsonEscape(eventName) & _
    """,""project"":""" & JsonEscape(base) & """,""pid"":" & CStr(CLng(pidValue)) & ",""url"":" & jsonUrl & _
    ",""runId"":""" & JsonEscape(runId) & """,""message"":""" & JsonEscape(message) & """}"

  rotated = RotateLogsIfNeeded(Len(jsonLine) + 2)
  If rotated Then
    On Error Resume Next
    Err.Clear
    Set logStream = fso.OpenTextFile(logFile, 8, True, 0)
    If Err.Number = 0 Then
      logStream.WriteLine jsonLine
      logStream.Close
    End If
    If Err.Number = 0 Then LogEvent = True
    On Error GoTo 0
  End If
  ReleaseLogLock
End Function

Function IsConsoleHost()
  IsConsoleHost = (LCase(fso.GetFileName(WScript.FullName)) = "cscript.exe")
End Function

Sub FailAndQuit(message, exitCode)
  logged = LogEvent("preflight-error", 0, ReadCurrentUrl(), message)
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
logged = LogEvent("handoff-start", 0, ReadCurrentUrl(), "Launching the Node UI launcher in hidden mode.")
exitCode = shell.Run(cmd, 0, True)
If exitCode <> 0 Then
  FailAndQuit "The UI launcher failed with exit code " & exitCode & ". Check .data\launcher.log and restore missing dependencies or application files.", exitCode
End If
logged = LogEvent("handoff-complete", 0, ReadCurrentUrl(), "The Node UI launcher completed successfully.")
