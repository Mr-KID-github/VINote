# Meeting recorder floating window behavior

## Current repository scope

This repository currently contains a Vite/React web frontend and a Python backend. It does not contain an Electron, Tauri, or other native desktop shell/main-process implementation.

Because of that, the web implementation cannot create a true operating-system-level always-on-top recorder window. Browser popup windows and Document Picture-in-Picture do not provide a reliable cross-browser, cross-OS guarantee that the recorder will remain above other applications or above another application's fullscreen window.

## Web behavior

For the web app, the meeting recorder remains a small draggable overlay inside the VINote browser window. It stays mounted at the application shell level, so it remains available while navigating within VINote.

The web UI must not show a "pop out", "export window", or optional inside/outside mode. In a browser, presenting that as always-on-top would be misleading.

## Desktop behavior required for a future native shell

When VINote adds a native desktop shell, meeting recording should use a native floating window by default:

- create at most one recorder window per active recording session;
- open it automatically when recording starts;
- keep it small, draggable, and initially positioned near the side/top of the screen;
- set native always-on-top where supported by the OS/window manager;
- keep it alive independently of the main VINote window while recording is active;
- synchronize pause, resume, stop, elapsed time, status, and errors through shared recording state or IPC;
- close or transition the floating window after recording stops according to the post-recording flow;
- document OS limitations where fullscreen apps or window managers prevent always-on-top overlays.
