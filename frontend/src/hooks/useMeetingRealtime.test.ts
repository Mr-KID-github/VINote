import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  apiJson: vi.fn(),
  apiUrl: vi.fn((path: string) => `http://localhost:8900${path}`),
}))

vi.mock('../lib/api', () => apiMock)

import { initialMeetingRealtimeState, reduceMeetingRealtimeEvent, useMeetingRealtime } from './useMeetingRealtime'

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  bufferedAmount = 0
  binaryType = ''
  sent: unknown[] = []
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED
  })
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(value: unknown) {
    this.sent.push(value)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  message(value: Record<string, unknown> | string) {
    this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) })
  }
}

describe('meeting realtime reducer', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    apiMock.apiJson.mockReset()
    apiMock.apiJson.mockResolvedValue({
      session_id: 'local-session',
      websocket_url: '/api/meeting/sessions/local-session/realtime',
    })
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('replaces ASR partials and preserves authoritative final text', () => {
    let state = reduceMeetingRealtimeEvent(initialMeetingRealtimeState, { type: 'asr.partial', text: 'hel' })
    state = reduceMeetingRealtimeEvent(state, { type: 'asr.partial', text: 'hello' })
    state = reduceMeetingRealtimeEvent(state, { type: 'asr.final', text: 'hello world' })
    const unchanged = reduceMeetingRealtimeEvent(state, { type: 'asr.partial', text: 'late' })
    expect(unchanged).toBe(state)
    expect(state.asrText).toBe('hello world')
  })

  it('marks the current buffered-final server as degraded instead of promising live text', () => {
    let state = reduceMeetingRealtimeEvent(initialMeetingRealtimeState, {
      type: 'speaker_transcript.ready', mode: 'buffered_final', livePartials: false,
    })
    state = reduceMeetingRealtimeEvent(state, { type: 'session.started' })
    expect(state.connection).toBe('degraded')
    expect(state.liveSpeakerTurns).toBe(false)
    expect(state.degradationMessage).toContain('after recording stops')
  })

  it('accepts the canonical revision field and replaces final snapshot turns', () => {
    let state = reduceMeetingRealtimeEvent(initialMeetingRealtimeState, {
      type: 'speaker_transcript.partial', revision: 1,
      turns: [{ turnId: 'old', text: 'draft', startMs: 0 }],
    })
    state = reduceMeetingRealtimeEvent(state, {
      type: 'speaker_transcript.final', revision: 2, rawText: 'final text',
      turns: [{ turnId: 'final', text: 'final text', startMs: 0 }],
    })
    const stale = reduceMeetingRealtimeEvent(state, {
      type: 'speaker_transcript.partial', revision: 1,
      turns: [{ turnId: 'late', text: 'late', startMs: 0 }],
    })
    expect(stale).toBe(state)
    expect(state.speakerTurns.map((turn) => turn.turnId)).toEqual(['final'])
    expect(state.asrText).toBe('final text')
    expect(state.speakerTurnsFinal).toBe(true)
  })

  it('applies explicit delta replacements and bounds snapshots', () => {
    let state = reduceMeetingRealtimeEvent(initialMeetingRealtimeState, {
      type: 'speaker_transcript.partial', snapshotRevision: 1,
      turns: [{ turnId: 'turn-a', text: 'draft', startMs: 0 }],
    })
    state = reduceMeetingRealtimeEvent(state, {
      type: 'speaker_transcript.partial', snapshotRevision: 2, replacedTurnIds: ['turn-a'],
      turns: [{ turnId: 'turn-b', text: 'replacement', startMs: 0, replacesTurnIds: ['turn-a'] }],
    })
    expect(state.speakerTurns.map((turn) => turn.turnId)).toEqual(['turn-b'])

    const segments = Array.from({ length: 250 }, (_, index) => ({ speakerId: `speaker-${index}` }))
    state = reduceMeetingRealtimeEvent(state, {
      type: 'diarization.partial', snapshotRevision: 1, segments,
    })
    expect(state.diarizationSegments).toHaveLength(200)
  })

  it('uses the backend API origin and flushes bounded pre-start audio only after session.started', async () => {
    const { result } = renderHook(() => useMeetingRealtime())
    await act(async () => result.current.start())
    const socket = FakeWebSocket.instances[0]
    expect(socket.url).toBe('ws://localhost:8900/api/meeting/sessions/local-session/realtime')

    const frame = new Uint8Array([1, 2])
    expect(result.current.sendFrame(frame)).toBe(true)
    expect(socket.sent).toEqual([])
    act(() => socket.open())
    expect(JSON.parse(String(socket.sent[0]))).toMatchObject({ type: 'session.start' })
    act(() => socket.message({ type: 'session.started', sessionId: 'local-session' }))
    expect(socket.sent[1]).toBe(frame)
  })

  it('accepts bounded PCM while the local session HTTP request is still pending', async () => {
    let resolveSession: (value: { session_id: string; websocket_url: string }) => void = () => undefined
    apiMock.apiJson.mockReturnValue(new Promise((resolve) => {
      resolveSession = resolve
    }))
    const { result } = renderHook(() => useMeetingRealtime())
    let startPromise: Promise<string>
    act(() => {
      startPromise = result.current.start()
    })
    const frame = new Uint8Array([3, 4])
    expect(result.current.sendFrame(frame)).toBe(true)

    await act(async () => {
      resolveSession({
        session_id: 'local-session',
        websocket_url: '/api/meeting/sessions/local-session/realtime',
      })
      await startPromise!
    })
    const socket = FakeWebSocket.instances[0]
    act(() => socket.open())
    act(() => socket.message({ type: 'session.started', sessionId: 'local-session' }))
    expect(socket.sent[1]).toBe(frame)
  })

  it('fails closed on queue pressure, malformed events, and stale socket callbacks', async () => {
    const { result } = renderHook(() => useMeetingRealtime())
    await act(async () => result.current.start())
    const first = FakeWebSocket.instances[0]
    let overflowAccepted = true
    act(() => {
      for (let index = 0; index < 250; index += 1) {
        expect(result.current.sendFrame(new Uint8Array(660))).toBe(true)
      }
      overflowAccepted = result.current.sendFrame(new Uint8Array(660))
    })
    expect(overflowAccepted).toBe(false)
    await waitFor(() => expect(result.current.state.connection).toBe('failed'))
    expect(first.close).toHaveBeenCalled()

    await act(async () => result.current.start())
    const second = FakeWebSocket.instances[1]
    act(() => second.message('{not-json'))
    await waitFor(() => expect(result.current.state.error).toContain('invalid event'))

    act(() => result.current.close(false))
    act(() => first.message({ type: 'asr.final', text: 'stale' }))
    expect(result.current.state.asrText).toBe('')
  })
})
