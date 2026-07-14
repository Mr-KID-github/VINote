import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson, apiUrl } from '../lib/api'

export type MeetingRealtimeConnection = 'idle' | 'connecting' | 'ready' | 'degraded' | 'closed' | 'failed'

export type MeetingRealtimeState = {
  connection: MeetingRealtimeConnection
  sessionId?: string
  mode?: string
  asrText: string
  asrFinal: boolean
  diarizationRevision: number
  diarizationSegments: Array<Record<string, unknown>>
  diarizationFinal: boolean
  speakerRevision: number
  speakerTurns: Array<Record<string, unknown>>
  speakerTurnsFinal: boolean
  liveSpeakerTurns: boolean | null
  degradationMessage?: string
  error?: string
}

export const initialMeetingRealtimeState: MeetingRealtimeState = {
  connection: 'idle',
  asrText: '',
  asrFinal: false,
  diarizationRevision: 0,
  diarizationSegments: [],
  diarizationFinal: false,
  speakerRevision: 0,
  speakerTurns: [],
  speakerTurnsFinal: false,
  liveSpeakerTurns: null,
}

function eventRevision(event: Record<string, unknown>, current: number) {
  const explicit = Number(event.snapshotRevision ?? event.revision)
  return Number.isSafeInteger(explicit) && explicit > 0 ? explicit : current + 1
}

function boundedRecords(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').slice(-200) : []
}

export function reduceMeetingRealtimeEvent(
  state: MeetingRealtimeState,
  event: Record<string, any>,
): MeetingRealtimeState {
  switch (event.type) {
    case 'session.accepted':
      return { ...state, connection: 'connecting', sessionId: String(event.sessionId || state.sessionId || '') }
    case 'speaker_transcript.ready': {
      const mode = typeof event.mode === 'string' ? event.mode : state.mode
      const hasLivePartials = event.livePartials === true || event.trueStreaming === true
      const degraded = event.degraded === true || mode === 'buffered_final' || event.livePartials === false
      return {
        ...state,
        mode,
        connection: degraded ? 'degraded' : state.connection,
        liveSpeakerTurns: typeof event.liveSpeakerTurns === 'boolean'
          ? event.liveSpeakerTurns
          : (degraded ? false : state.liveSpeakerTurns),
        degradationMessage: event.degradation?.message
          || event.degradationMessage
          || (degraded && !hasLivePartials ? 'Transcript will appear after recording stops.' : state.degradationMessage),
      }
    }
    case 'session.started':
      return { ...state, connection: state.connection === 'degraded' || event.degraded ? 'degraded' : 'ready' }
    case 'asr.partial':
      return state.asrFinal ? state : { ...state, asrText: String(event.text || ''), asrFinal: false }
    case 'asr.final':
      return { ...state, asrText: String(event.text || ''), asrFinal: true }
    case 'diarization.partial':
    case 'diarization.final': {
      const revision = eventRevision(event, state.diarizationRevision)
      if (revision <= state.diarizationRevision) return state
      return {
        ...state,
        diarizationRevision: revision,
        diarizationSegments: boundedRecords(event.segments),
        diarizationFinal: event.type === 'diarization.final',
      }
    }
    case 'speaker_transcript.partial':
    case 'speaker_transcript.final': {
      const revision = eventRevision(event, state.speakerRevision)
      if (revision <= state.speakerRevision) return state
      const incoming = boundedRecords(event.turns)
      const usesDelta = Array.isArray(event.replacedTurnIds)
        || incoming.some((turn) => Array.isArray(turn.replacesTurnIds))
      let turns = incoming
      if (usesDelta) {
        const removed = new Set<string>((event.replacedTurnIds || []).map(String))
        const next = new Map(state.speakerTurns.map((turn) => [String(turn.turnId), turn]))
        for (const id of removed) next.delete(id)
        for (const turn of incoming) {
          for (const id of Array.isArray(turn.replacesTurnIds) ? turn.replacesTurnIds : []) next.delete(String(id))
          if (turn.turnId) next.set(String(turn.turnId), turn)
        }
        turns = [...next.values()]
      }
      turns = turns
        .sort((left, right) => Number(left.startMs || 0) - Number(right.startMs || 0))
        .slice(-200)
      return {
        ...state,
        speakerRevision: revision,
        speakerTurns: turns,
        speakerTurnsFinal: event.type === 'speaker_transcript.final',
        asrText: event.type === 'speaker_transcript.final' && typeof event.rawText === 'string'
          ? event.rawText
          : state.asrText,
        asrFinal: event.type === 'speaker_transcript.final' ? true : state.asrFinal,
      }
    }
    case 'speaker_transcript.completed':
    case 'session.completed':
    case 'session.cancelled':
      return { ...state, connection: 'closed' }
    case 'error':
      return {
        ...state,
        connection: event.fatal ? 'failed' : state.connection,
        error: String(event.message || event.code || 'Realtime error'),
      }
    default:
      return state
  }
}

function websocketUrl(path: string) {
  const base = new URL(apiUrl(path), window.location.origin)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return base.toString()
}

const MAX_PENDING_FRAMES = 250
const MAX_PENDING_BYTES = 200_000
const MAX_SOCKET_BUFFERED_BYTES = 512_000

export function useMeetingRealtime() {
  const [state, setState] = useState(initialMeetingRealtimeState)
  const socketRef = useRef<WebSocket | null>(null)
  const generationRef = useRef(0)
  const acceptingFramesRef = useRef(false)
  const startedRef = useRef(false)
  const pendingFramesRef = useRef<Uint8Array[]>([])
  const pendingBytesRef = useRef(0)

  const failTransport = useCallback((message: string) => {
    acceptingFramesRef.current = false
    pendingFramesRef.current = []
    pendingBytesRef.current = 0
    setState((current) => ({ ...current, connection: 'failed', error: message }))
    socketRef.current?.close(1011, 'realtime transport failed')
  }, [])

  const close = useCallback((cancel = false) => {
    generationRef.current += 1
    acceptingFramesRef.current = false
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN && cancel) {
      socket.send(JSON.stringify({ type: 'session.cancel', reason: 'client_close' }))
    }
    socket?.close()
    socketRef.current = null
    startedRef.current = false
    pendingFramesRef.current = []
    pendingBytesRef.current = 0
  }, [])

  const start = useCallback(async (language?: string) => {
    close(false)
    const generation = generationRef.current
    acceptingFramesRef.current = true
    setState({ ...initialMeetingRealtimeState, connection: 'connecting' })
    let session: { session_id: string; websocket_url: string }
    try {
      session = await apiJson<{ session_id: string; websocket_url: string }>(
        '/api/meeting/sessions',
        { method: 'POST' },
      )
    } catch (error) {
      if (generation === generationRef.current) {
        failTransport(error instanceof Error ? error.message : 'Realtime meeting session failed')
      }
      throw error
    }
    if (generation !== generationRef.current) throw new Error('Realtime meeting start was superseded')
    const socket = new WebSocket(websocketUrl(session.websocket_url))
    socket.binaryType = 'arraybuffer'
    socketRef.current = socket
    socket.onopen = () => {
      if (generation !== generationRef.current) return
      socket.send(JSON.stringify({
        type: 'session.start',
        audio: { encoding: 'pcm_s16le', sampleRate: 16000, channels: 1 },
        ...(language ? { language } : {}),
        emitPartialSegments: true,
      }))
    }
    socket.onmessage = (message) => {
      if (generation !== generationRef.current || typeof message.data !== 'string') return
      let event: Record<string, unknown>
      try {
        event = JSON.parse(message.data)
      } catch {
        failTransport('Realtime server returned an invalid event')
        return
      }
      if (event.type === 'session.started') {
        startedRef.current = true
        for (const frame of pendingFramesRef.current) {
          if (socket.bufferedAmount + frame.byteLength > MAX_SOCKET_BUFFERED_BYTES) {
            failTransport('Realtime connection cannot keep up with queued audio')
            return
          }
          socket.send(frame)
        }
        pendingFramesRef.current = []
        pendingBytesRef.current = 0
      }
      setState((current) => reduceMeetingRealtimeEvent(current, event))
    }
    socket.onerror = () => {
      if (generation === generationRef.current) failTransport('Realtime connection failed')
    }
    socket.onclose = () => {
      if (generation !== generationRef.current) return
      socketRef.current = null
      acceptingFramesRef.current = false
      startedRef.current = false
      pendingFramesRef.current = []
      pendingBytesRef.current = 0
      setState((current) => current.connection === 'failed' ? current : { ...current, connection: 'closed' })
    }
    return session.session_id
  }, [close, failTransport])

  const sendFrame = useCallback((frame: Uint8Array) => {
    const socket = socketRef.current
    if (socket && socket.readyState >= WebSocket.CLOSING) return false
    if (!acceptingFramesRef.current && (!socket || !startedRef.current)) return false
    if ((!socket && acceptingFramesRef.current) || (socket && (!startedRef.current || socket.readyState !== WebSocket.OPEN))) {
      if (
        pendingFramesRef.current.length >= MAX_PENDING_FRAMES
        || pendingBytesRef.current + frame.byteLength > MAX_PENDING_BYTES
      ) {
        failTransport('Realtime audio queue exceeded five seconds')
        return false
      }
      pendingFramesRef.current.push(frame)
      pendingBytesRef.current += frame.byteLength
      return true
    }
    if (!socket) return false
    if (socket.bufferedAmount + frame.byteLength > MAX_SOCKET_BUFFERED_BYTES) {
      failTransport('Realtime connection cannot keep up with audio')
      return false
    }
    socket.send(frame)
    return true
  }, [failTransport])

  const markDegraded = useCallback((message: string) => {
    setState((current) => ({
      ...current,
      connection: current.connection === 'failed' ? 'failed' : 'degraded',
      degradationMessage: message,
    }))
  }, [])

  useEffect(() => () => close(true), [close])

  return { state, start, sendFrame, close, markDegraded }
}
