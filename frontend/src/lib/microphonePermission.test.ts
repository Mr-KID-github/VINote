import { describe, expect, it, vi } from 'vitest'
import { checkMicrophoneReadiness, mapMicrophoneError } from './microphonePermission'

describe('microphonePermission', () => {
  it('reports unsupported browsers before starting recording', async () => {
    const result = await checkMicrophoneReadiness({ mediaDevices: undefined })

    expect(result).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('reports denied permission without opening a repeated getUserMedia prompt', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' })
    const getUserMedia = vi.fn()

    const result = await checkMicrophoneReadiness({
      permissions: { query } as unknown as Permissions,
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
    })

    expect(result).toEqual({ ok: false, reason: 'denied' })
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('reports no input device when enumeration is available and empty', async () => {
    const result = await checkMicrophoneReadiness({
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) } as unknown as Permissions,
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'videoinput' }]),
      } as unknown as MediaDevices,
    })

    expect(result).toEqual({ ok: false, reason: 'no-device' })
  })

  it('maps browser recording errors to stable reason codes', () => {
    expect(mapMicrophoneError(new DOMException('denied', 'NotAllowedError'))).toBe('denied')
    expect(mapMicrophoneError(new DOMException('missing', 'NotFoundError'))).toBe('no-device')
    expect(mapMicrophoneError(new DOMException('busy', 'NotReadableError'))).toBe('unavailable')
  })
})
