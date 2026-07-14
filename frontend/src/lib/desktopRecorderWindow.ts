import { invoke } from '@tauri-apps/api/core'
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { MeetingRecorderExternalSnapshot } from '../stores/meetingRecorderStore'
import { isTauriRuntime } from './desktopMicrophonePermission'

const RECORDER_STATE_EVENT = 'meeting-recorder-state'
const RECORDER_OPEN_EVENT = 'vinote-recorder-open-panel'
const NAVIGATE_EVENT = 'vinote-navigate'

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

export async function setRecorderWindowLayout(layout: 'expanded' | 'minimized') {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  await invoke('set_recorder_window_layout', { layout })
}

export async function closeCurrentRecorderWindow() {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  await getCurrentWindow().close()
}

export async function startCurrentRecorderWindowDrag() {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  await getCurrentWindow().startDragging()
}

export async function showMainWindow(route?: string) {
  if (!isTauriRuntime()) return
  await invoke('show_main_window', { route })
}

export async function emitRecorderWindowState(snapshot: MeetingRecorderExternalSnapshot) {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  await emit(RECORDER_STATE_EVENT, snapshot)
}

export async function listenRecorderWindowState(
  handler: (snapshot: MeetingRecorderExternalSnapshot) => void,
): Promise<UnlistenFn | undefined> {
  if (!isTauriRuntime() || isRecorderWindowRoute()) return undefined
  return listen<MeetingRecorderExternalSnapshot>(RECORDER_STATE_EVENT, (event) => handler(event.payload))
}

export async function emitRecorderOpenPanel() {
  if (!isTauriRuntime() || isRecorderWindowRoute()) return
  await emit(RECORDER_OPEN_EVENT)
}

export async function listenRecorderOpenPanel(handler: () => void): Promise<UnlistenFn | undefined> {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return undefined
  return listen(RECORDER_OPEN_EVENT, () => handler())
}

export async function listenDesktopNavigation(handler: (route: string) => void): Promise<UnlistenFn | undefined> {
  if (!isTauriRuntime() || isRecorderWindowRoute()) return undefined
  return listen<string>(NAVIGATE_EVENT, (event) => handler(event.payload))
}
