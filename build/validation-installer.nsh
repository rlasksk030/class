; Separate validation identity. Never touch production legacy registrations,
; startup entries, uninstallers or data. Default per-user directory is fixed.
!macro customCheckAppRunning
  nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  nsProcess::_Unload
  ${If} $R0 != 603
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
