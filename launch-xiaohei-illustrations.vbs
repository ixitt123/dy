Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
logFile = base & "\.data\xiaohei-illustrations-launcher.log"

Sub LogLine(message)
  On Error Resume Next
  If Not fso.FolderExists(base & "\.data") Then fso.CreateFolder(base & "\.data")
  Set log = fso.OpenTextFile(logFile, 8, True)
  log.WriteLine Now & " " & message
  log.Close
  On Error GoTo 0
End Sub

Function FindNode()
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

  tempFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\xiaohei-illustrations-node-path.txt"
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
If nodePath = "" Then
  LogLine "Node.js was not found."
  WScript.Quit 1
End If

cmd = """" & nodePath & """ """ & base & "\launch-xiaohei-illustrations.mjs"""
shell.CurrentDirectory = base
LogLine "Launching Ian Xiaohei illustration app in hidden mode."
shell.Run cmd, 0, False
