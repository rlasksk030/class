; Included by electron-builder (nsis.include). Runs at the end of every install/update.
; v1.8.0/v1.8.1 were built with appId kr.classroom.dashboard (GUID 80d89bea-...). Installed into the same
; per-user folder as v1.7.x, they left a second "우리 교실" entry in Settings > Apps. When that entry points to
; this very folder, only its registry entries are removed: no uninstaller is run and no file is deleted,
; so the app, shortcuts and %APPDATA%\classroom-dashboard stay as they are. An entry for another folder
; (for example an all-users copy in Program Files) is left untouched.
!macro customInstall
  Push $0
  Push $1
  StrCpy $1 ""
  ReadRegStr $0 HKCU "Software\80d89bea-829d-5beb-a731-910f2523db96" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\80d89bea-829d-5beb-a731-910f2523db96" "InstallLocation"
  ${EndIf}
  ${If} $0 != ""
  ${AndIf} $0 == $INSTDIR
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\80d89bea-829d-5beb-a731-910f2523db96"
    DeleteRegKey HKCU "Software\80d89bea-829d-5beb-a731-910f2523db96"
  ${EndIf}
  Pop $1
  Pop $0
!macroend
