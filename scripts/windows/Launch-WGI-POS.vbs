Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptFolder = fso.GetParentFolderName(WScript.ScriptFullName)
project = fso.GetParentFolderName(fso.GetParentFolderName(scriptFolder))
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & project & "\scripts\windows\Start-WGI-POS.ps1"""
shell.CurrentDirectory = project
shell.Run command, 0, False
