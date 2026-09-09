import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeCurrentRecorderWindow } from './desktopRecorderWindow'

const nativeWindow = vi.hoisted(() => ({ close: vi.fn(), hide: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => nativeWindow }))
vi.mock('./desktopMicrophonePermission', () => ({ isTauriRuntime: () => true }))

describe('closing the desktop recorder', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.history.replaceState({}, '', '/?recorderWindow=1')
  })
  it('closes a shell with close permission', async () => {
    await closeCurrentRecorderWindow()
    expect(nativeWindow.close).toHaveBeenCalledOnce()
    expect(nativeWindow.hide).not.toHaveBeenCalled()
  })
  it('hides an older shell that lacks close permission after hot reload', async () => {
    nativeWindow.close.mockRejectedValue('window.close not allowed. Permissions: core:window:allow-close')
    await closeCurrentRecorderWindow()
    expect(nativeWindow.hide).toHaveBeenCalledOnce()
  })
  it('does not swallow unrelated native failures', async () => {
    nativeWindow.close.mockRejectedValue(new Error('window unavailable'))
    await expect(closeCurrentRecorderWindow()).rejects.toThrow('window unavailable')
    expect(nativeWindow.hide).not.toHaveBeenCalled()
  })
})
