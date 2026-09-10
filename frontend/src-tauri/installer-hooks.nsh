; Tauri's default check only closes the UI executable. The bundled Python
; backend also holds DLLs open and must exit before upgrade/uninstall.
!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "vinote.exe" "VINote"
  !insertmacro CheckIfAppIsRunning "vinote-backend.exe" "VINote backend"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CheckIfAppIsRunning "vinote-backend.exe" "VINote backend"
!macroend
