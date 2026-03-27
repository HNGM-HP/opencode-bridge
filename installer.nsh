!macro customHeader
  !system "echo 'Custom NSIS Header'"
!macroend

!macro customInstall
  ; 添加开机自启选项
  MessageBox MB_YESNO "是否设置开机自动启动？" IDYES setAutoStart IDNO skipAutoStart
  setAutoStart:
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenCode Bridge" "$INSTDIR\OpenCode Bridge.exe"
  skipAutoStart:
!macroend

!macro customUnInstall
  ; 删除开机自启项
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenCode Bridge"
!macroend