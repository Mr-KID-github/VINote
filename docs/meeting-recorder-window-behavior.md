# Meeting recorder floating window behavior

## Web behavior

The web app keeps the meeting recorder as a small draggable overlay inside the VINote browser window. It stays mounted at the application shell level, so it remains available while navigating within VINote.

The web UI must not show a "pop out", "export window", or optional inside/outside mode. In a browser, presenting that as always-on-top would be misleading because browser windows cannot guarantee true OS-level always-on-top behavior.

## Desktop behavior

The Tauri desktop app supports a native recorder window by default:

- clicking Start in the main app opens one native `recorder-window` instead of starting MediaRecorder in the main window;
- the recorder window is created by Rust/Tauri with a stable `recorder-window` label;
- duplicate Start clicks focus the existing recorder window rather than creating duplicates;
- the native window is small, borderless, skipped from taskbar, positioned near the screen edge/top, and configured with `always_on_top`;
- the recorder window loads `index.html?recorderWindow=1&autostart=1`, mounts the same `MeetingRecorderDock`, and auto-starts recording there;
- the web build still keeps the in-app draggable overlay and has no broken pop-out button.

## Platform notes

Always-on-top is requested through the native Tauri window API. Some operating systems/window managers may still restrict overlays above exclusive fullscreen applications.
