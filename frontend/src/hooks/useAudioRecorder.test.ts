import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioRecorder } from './useAudioRecorder'

type RecorderBehavior = 'normal' | 'missing-stop-event'

let recorderBehavior: RecorderBehavior = 'normal'
let lastRecorder: FakeMediaRecorder | null = null
let stopTrack: ReturnType<typeof vi.fn>

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true)

  state: RecordingState = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: (() => void) | null = null
  onstop: (() => void) | null = null
  start = vi.fn(() => {
    this.state = 'recording'
  })
  pause = vi.fn(() => {
    this.state = 'paused'
  })
  resume = vi.fn(() => {
    this.state = 'recording'
  })
  requestData = vi.fn(() => {
    this.emitChunk('request-data')
  })
  stop = vi.fn(() => {
    this.state = 'inactive'
    this.emitChunk('stop-data')
    if (recorderBehavior === 'normal') {
      this.onstop?.()
    }
  })

  constructor() {
    lastRecorder = this
  }

  private emitChunk(value: string) {
    this.ondataavailable?.({
      data: new Blob([value], { type: this.mimeType }),
    } as BlobEvent)
  }
}

describe('useAudioRecorder', () => {
  beforeEach(() => {
    vi.useRealTimers()
    recorderBehavior = 'normal'
    lastRecorder = null
    stopTrack = vi.fn()
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getAudioTracks: () => [{ stop: stopTrack }],
          getTracks: () => [{ stop: stopTrack }],
        }),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('flushes pending media data before stopping', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.start()
    })
    const blob = await act(async () => result.current.stop())

    expect(lastRecorder?.requestData).toHaveBeenCalledTimes(1)
    expect(lastRecorder?.stop).toHaveBeenCalledTimes(1)
    expect(blob.size).toBeGreaterThan(0)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('stopped')
  })

  it('finalizes the recording if the WebView never fires onstop', async () => {
    vi.useFakeTimers()
    recorderBehavior = 'missing-stop-event'
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      await result.current.start()
    })

    let stopPromise: Promise<Blob>
    await act(async () => {
      stopPromise = result.current.stop()
    })
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    const blob = await stopPromise!
    expect(blob.size).toBeGreaterThan(0)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('stopped')
  })
})
