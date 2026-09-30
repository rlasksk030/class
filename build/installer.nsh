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

; Runs in .onInit, before the old version is uninstalled. When both the v1.7.x (d78eedc4-...) and the v1.8.x
; (80d89bea-...) registrations point to the same folder, the shared "Uninstall 우리 교실.exe" there is the v1.8.x
; one; running it as the v1.7.x uninstaller hangs in silent mode (measured on Windows, scenario D). The v1.7.x
; registration is dropped first so no old uninstaller runs and the files are replaced in place (the path that
; scenarios A and E verified); this install then writes a fresh v1.7.x-appId registration, and customInstall
; removes the v1.8.x one. No file and no user data is touched.
!macro preInit
  Push $0
  Push $1
  ReadRegStr $0 HKCU "Software\80d89bea-829d-5beb-a731-910f2523db96" "InstallLocation"
  ReadRegStr $1 HKCU "Software\d78eedc4-9833-5771-9f01-d94e51e1b797" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} $0 == $1
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\d78eedc4-9833-5771-9f01-d94e51e1b797"
    DeleteRegKey HKCU "Software\d78eedc4-9833-5771-9f01-d94e51e1b797"
  ${EndIf}
  Pop $1
  Pop $0
!macroend
