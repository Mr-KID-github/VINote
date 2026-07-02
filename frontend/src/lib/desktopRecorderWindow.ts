import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauriRuntime } from './desktopMicrophonePermission'

export { isTauriRuntime } from './desktopMicrophonePermission'

export function isRecorderWindowRoute() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('recorderWindow') === '1'
}

export async function openRecorderWindow() {
  if (!isTauriRuntime()) return 'web'
  return invoke<string>('open_recorder_window')
}

export async function closeCurrentRecorderWindow() {
  if (!isTauriRuntime() || !isRecorderWindowRoute()) return
  await getCurrentWindow().close()
}
