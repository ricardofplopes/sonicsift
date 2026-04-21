; SonicSift NSIS installer hooks
; Checks for FFmpeg and offers to install it via winget if missing.

!include "LogicLib.nsh"

!macro NSIS_HOOK_POSTINSTALL
  ; --- Check if FFmpeg is already on PATH ---
  nsExec::ExecToLog 'where.exe ffmpeg.exe'
  Pop $0
  ${If} $0 == 0
    DetailPrint "FFmpeg found on PATH."
    Goto ffmpeg_done
  ${EndIf}

  DetailPrint "FFmpeg not found on PATH."

  ; --- Silent mode: attempt auto-install, no prompts ---
  IfSilent 0 +3
    DetailPrint "Silent mode: attempting automatic FFmpeg install via winget..."
    Goto ffmpeg_try_winget

  ; --- Interactive mode: ask user ---
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "SonicSift requires FFmpeg to process audio.$\r$\n$\r$\n\
FFmpeg was not found on your system.$\r$\n$\r$\n\
Would you like to install it automatically via winget?" \
    IDYES ffmpeg_try_winget

  ; User declined
  MessageBox MB_OK|MB_ICONINFORMATION \
    "You can install FFmpeg manually later:$\r$\n$\r$\n\
1. Open a terminal and run:  winget install Gyan.FFmpeg$\r$\n\
2. Or download from: https://ffmpeg.org/download.html$\r$\n$\r$\n\
SonicSift will not work until FFmpeg is installed."
  Goto ffmpeg_done

ffmpeg_try_winget:
  ; --- Check if winget is available ---
  nsExec::ExecToLog 'winget.exe --version'
  Pop $0
  ${If} $0 != 0
    DetailPrint "winget is not available on this system."
    IfSilent ffmpeg_done 0
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "winget is not available on this system.$\r$\n$\r$\n\
Please install FFmpeg manually:$\r$\n\
  https://ffmpeg.org/download.html$\r$\n$\r$\n\
Or install the App Installer from the Microsoft Store to enable winget."
    Goto ffmpeg_done
  ${EndIf}

  ; --- Install FFmpeg via winget ---
  DetailPrint "Installing FFmpeg via winget (this may take a minute)..."
  nsExec::ExecToLog 'winget.exe install --id Gyan.FFmpeg -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity'
  Pop $0
  ${If} $0 == 0
    DetailPrint "FFmpeg installed successfully via winget."
    IfSilent ffmpeg_done 0
    MessageBox MB_OK|MB_ICONINFORMATION \
      "FFmpeg was installed successfully.$\r$\n$\r$\n\
Note: You may need to restart SonicSift or open a new terminal for FFmpeg to be detected on PATH."
  ${Else}
    DetailPrint "FFmpeg installation via winget failed (exit code: $0)."
    IfSilent ffmpeg_done 0
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Automatic FFmpeg installation failed.$\r$\n$\r$\n\
Please install FFmpeg manually:$\r$\n\
1. Open a terminal and run:  winget install Gyan.FFmpeg$\r$\n\
2. Or download from: https://ffmpeg.org/download.html"
  ${EndIf}

ffmpeg_done:
!macroend
