Set WshShell = CreateObject("WScript.Shell")
' Get the directory where this script is located
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Convert Windows path to WSL path
' Replace C:\ with /mnt/c/, D:\ with /mnt/d/, etc.
wslPath = Replace(scriptDir, "\", "/")
wslPath = Replace(wslPath, ":", "")
wslPath = LCase(Left(wslPath, 1)) & Mid(wslPath, 2)
wslPath = "/mnt/" & wslPath

' Run the bash script in WSL
command = "wsl.exe bash -c 'cd """ & wslPath & """ && bash start-gui.sh'"
WshShell.Run command, 1, False

' Optional: Show a message
MsgBox "Lando GUI is starting..." & vbCrLf & "Check http://localhost:3000 in a moment!", vbInformation, "Lando GUI"
