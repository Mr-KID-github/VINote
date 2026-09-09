import { invoke } from '@tauri-apps/api/core'
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauriRuntime } from './desktopMicrophonePermission'
import type { MeetingRecorderExternalSnapshot } from '../stores/meetingRecorderStore'

const RECORDER_EVENT = 'meeting-recorder-state'
const NAVIGATE_EVENT = 'vinote-navigate'
const RECORDER_OPEN_PANEL_EVENT = 'vinote-recorder-open-panel'

export { isTauriRuntime } from './desktopMicrophonePermission'

export function isRecorderWindowRoute() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('recorderWindow') === '1'
}

export async function openRecorderWindow() {
  if (!isTauriRuntime()) return 'web'
  return invoke<string>('open_recorder_window')
}

export async function setRecorderActive(active: boolean) {
  if (!isTauriRuntime()) return
  await invoke('set_recorder_active', { active })
}

export async function showMainWindow(route?: string) {
  if (!isTauriRuntime()) return
  await invoke('show_main_window', { route })
}

export async function setRecorderWindowLayout(layout: 'expanded' | 'minimized') {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  await invoke('set_recorder_window_layout', { layout })
}

export async function setRecorderWindowSize(width: number, height: number) {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  try {
    await invoke('set_recorder_window_size', { width, height })
  } catch (error) {
    // Resize failures should never break the recorder UI; log and continue.
    // eslint-disable-next-line no-console
    console.warn('[recorder-window] failed to resize native window', error)
  }
}

export async function closeCurrentRecorderWindow() {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  const recorderWindow = getCurrentWindow()
  try {
    await recorderWindow.close()
  } catch (error) {
    // A running desktop shell may predate allow-close while its frontend has
    // hot-reloaded. It already permits hide; the next open resets inactive windows.
    if (!/not allowed|not permitted|denied|allow-close/i.test(String(error))) throw error
    await recorderWindow.hide()
  }
}

export async function startCurrentRecorderWindowDrag() {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  await getCurrentWindow().startDragging()
}

export async function emitRecorderWindowState(snapshot: MeetingRecorderExternalSnapshot) {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  await emit(RECORDER_EVENT, snapshot)
}

export async function listenRecorderWindowState(
  handler: (snapshot: MeetingRecorderExternalSnapshot) => void,
): Promise<UnlistenFn | undefined> {
  if (!isTauriRuntime() || isRecorderWindowRoute()) return undefined
  return listen<MeetingRecorderExternalSnapshot>(RECORDER_EVENT, (event) => handler(event.payload))
}

export async function listenDesktopNavigation(
  handler: (route: string) => void,
): Promise<UnlistenFn | undefined> {
  if (!isTauriRuntime() || isRecorderWindowRoute()) return undefined
  return listen<string>(NAVIGATE_EVENT, (event) => handler(event.payload))
}

export async function emitRecorderOpenPanel() {
  if (!isTauriRuntime() || isRecorderWindowRoute()) return
  await emit(RECORDER_OPEN_PANEL_EVENT)
}

export async function listenRecorderOpenPanel(
  handler: () => void,
): Promise<UnlistenFn | undefined> {
  if (!isTauriRuntime() || isRecorderWindowRoute()) return undefined
  return listen(RECORDER_OPEN_PANEL_EVENT, () => handler())
}
