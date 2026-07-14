import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioRecorder } from './useAudioRecorder'

type RecorderBehavior = 'normal' | 'missing-stop-event'

let recorderBehavior: RecorderBehavior = 'normal'
let lastRecorder: FakeMediaRecorder | null = null
let stopTrack: ReturnType<typeof vi.fn>
let fakeProcessor: { onaudioprocess: ((event: any) => void) | null; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }
let closeAudioContext: ReturnType<typeof vi.fn>

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
    closeAudioContext = vi.fn().mockResolvedValue(undefined)
    fakeProcessor = { onaudioprocess: null, connect: vi.fn(), disconnect: vi.fn() }
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

  it('excludes paused wall time from elapsed recording time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T00:00:00Z'))
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => result.current.start())
    await act(async () => {
      vi.advanceTimersByTime(2200)
    })
    act(() => result.current.pause())
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    act(() => result.current.resume())
    await act(async () => {
      vi.advanceTimersByTime(1300)
    })

    expect(result.current.elapsedSeconds).toBe(3)
  })

  it('derives silent-monitor PCM from the same stream without changing the recorded blob', async () => {
    const pcm = vi.fn()
    const source = { connect: vi.fn(), disconnect: vi.fn() }
    vi.stubGlobal('AudioContext', class {
      sampleRate = 48_000
      state = 'running'
      destination = {}
      audioWorklet = undefined
      createMediaStreamSource = vi.fn(() => source)
      createScriptProcessor = vi.fn(() => fakeProcessor)
      resume = vi.fn()
      close = closeAudioContext
    })
    const { result } = renderHook(() => useAudioRecorder(pcm))

    await act(async () => result.current.start())
    const output = new Float32Array(2).fill(1)
    act(() => fakeProcessor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array([0.25, -0.25]) },
      outputBuffer: { getChannelData: () => output },
    }))
    const blob = await act(async () => result.current.stop())

    expect(pcm).toHaveBeenCalledWith(expect.any(Float32Array), 48_000)
    expect(output).toEqual(new Float32Array([0, 0]))
    expect(blob.size).toBeGreaterThan(0)
    expect(closeAudioContext).toHaveBeenCalledTimes(1)
  })
})
