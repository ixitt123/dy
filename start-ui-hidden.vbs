Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)

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
If nodePath = "" Then
  shell.Popup "Node.js was not found. Install Node.js 22 or newer, then run the dependency installer.", 10, "Douyin Video Tool", 48
  WScript.Quit 1
End If

packagePath = base & "\node_modules\@yc-w-cn\douyin-mcp-server\package.json"
If Not fso.FileExists(packagePath) Then
  shell.Popup "First launch may install project dependencies. Please wait a moment after closing this message.", 5, "Douyin Video Tool", 64
End If

cmd = """" & nodePath & """ """ & base & "\launch-ui.mjs"""
shell.CurrentDirectory = base
shell.Run cmd, 0, False
