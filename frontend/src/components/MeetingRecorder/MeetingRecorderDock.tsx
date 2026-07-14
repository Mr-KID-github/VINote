import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AlertCircle, CheckCircle2, Loader2, MessageSquareText, Mic, Minimize2, Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { useMeetingRealtime } from '../../hooks/useMeetingRealtime'
import {
  closeCurrentRecorderWindow,
  emitRecorderOpenPanel,
  emitRecorderWindowState,
  isRecorderWindowRoute,
  isTauriRuntime,
  listenDesktopNavigation,
  listenRecorderOpenPanel,
  listenRecorderWindowState,
  openRecorderWindow,
  setRecorderActive,
  setRecorderWindowLayout,
  showMainWindow,
  startCurrentRecorderWindowDrag,
} from '../../lib/desktopRecorderWindow'
import { useI18n } from '../../lib/i18n'
import { deleteRecordedAudio, generateRecordingId, loadRecordedAudio, saveRecordedAudio } from '../../lib/audioStorage'
import { completeMeetingRecordingGeneration, submitMeetingRecording } from '../../lib/meetingGeneration'
import type { TaskStatusResponse } from '../../lib/noteGenerationClient'
import { RealtimePcmFramer } from '../../lib/realtimeAudio'
import { useMeetingRecorderStore, type MeetingRecorderPhase } from '../../stores/meetingRecorderStore'
import { useTeamStore } from '../../stores/teamStore'

const PANEL_WIDTH = 320
const PANEL_HEIGHT = 220
const EDGE_PADDING = 16

const PROCESSING_PHASES: MeetingRecorderPhase[] = ['requesting', 'stopping', 'uploading', 'transcribing', 'summarizing']
const WAVEFORM_BAR_HEIGHTS = [12, 20, 14, 26, 18, 24, 10] as const
const NATIVE_PROTECTED_PHASES: MeetingRecorderPhase[] = [
  'requesting', 'recording', 'paused', 'stopping', 'uploading', 'transcribing', 'summarizing',
]

function getInitialPosition() {
  if (typeof window === 'undefined') {
    return { x: EDGE_PADDING, y: EDGE_PADDING }
  }

  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - PANEL_WIDTH - 24),
    y: Math.max(EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - 24),
  }
}

function clampPosition(x: number, y: number) {
  if (typeof window === 'undefined') {
    return { x, y }
  }

  return {
    x: Math.min(Math.max(EDGE_PADDING, x), Math.max(EDGE_PADDING, window.innerWidth - PANEL_WIDTH - EDGE_PADDING)),
    y: Math.min(Math.max(EDGE_PADDING, y), Math.max(EDGE_PADDING, window.innerHeight - 96)),
  }
}

function formatElapsedTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function phaseToCopyKey(phase: MeetingRecorderPhase) {
  return phase
}

function formatRecorderFailure(
  error: unknown,
  fallback: string,
  copy: {
    serverConnectionRequired: string
    microphoneDenied: string
    microphoneRestricted: string
    microphoneTimeout: string
    microphoneNoAudio: string
  },
) {
  const message = error instanceof Error ? error.message : String(error || '')
  const normalized = message.toLowerCase()

  if (
    normalized.includes('invalid api key') ||
    normalized.includes('incorrect api key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('401')
  ) {
    return copy.serverConnectionRequired
  }

  if (normalized.includes('microphone_denied')) {
    return copy.microphoneDenied
  }
  if (normalized.includes('microphone_restricted')) {
    return copy.microphoneRestricted
  }
  if (normalized.includes('microphone_request_timeout')) {
    return copy.microphoneTimeout
  }
  if (normalized.includes('microphone_no_audio')) {
    return copy.microphoneNoAudio
  }

  return message || fallback
}

interface MeetingRecorderDockProps {
  autoStart?: boolean
}

export function MeetingRecorderDock({ autoStart = false }: MeetingRecorderDockProps) {
  const navigate = useNavigate()
  const isRecorderWindow = isRecorderWindowRoute()
  const isDesktopMainWindow = isTauriRuntime() && !isRecorderWindow
  const realtime = useMeetingRealtime()
  const pcmFramerRef = useRef(new RealtimePcmFramer())
  const handlePcmFrame = useCallback((samples: Float32Array, sampleRate: number) => {
    for (const frame of pcmFramerRef.current.push(samples, sampleRate)) realtime.sendFrame(frame)
  }, [realtime.sendFrame])
  const recorder = useAudioRecorder(handlePcmFrame, realtime.markDegraded)
  const { copy, language } = useI18n()
  const { currentWorkspace } = useTeamStore()
  const {
    isPanelOpen,
    isMinimized,
    phase,
    elapsedSeconds,
    taskId,
    noteId,
    recordingId,
    recordedAudio,
    recordingStartedAt,
    meetingSessionId,
    error,
    notification,
    openPanel,
    closePanel,
    minimizePanel,
    restorePanel,
    setPhase,
    setElapsedSeconds,
    setRecordingStartedAt,
    setTaskId,
    setRecordedAudio,
    setMeetingSessionId,
    setLiveTranscript,
    complete,
    fail,
    dismissNotification,
    syncExternalState,
    resetSession,
  } = useMeetingRecorderStore()
  const [position, setPosition] = useState(getInitialPosition)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const startedAtRef = useRef<Date | null>(null)
  const finishInFlightRef = useRef(false)
  const recoveryCheckedRef = useRef(false)
  const supersededRecordingIdRef = useRef<string | null>(null)
  const meetingSessionIdRef = useRef<string | null>(meetingSessionId || null)
  const autoStartHandledRef = useRef(false)
  const liveTranscript = useMemo(() => ({
    connection: realtime.state.connection,
    mode: realtime.state.mode,
    asrText: realtime.state.asrText,
    speakerTurns: realtime.state.speakerTurns.map((turn) => ({
      turnId: typeof turn.turnId === 'string' ? turn.turnId : undefined,
      speakerId: typeof turn.speakerId === 'string' ? turn.speakerId : undefined,
      startMs: Number.isFinite(Number(turn.startMs)) ? Number(turn.startMs) : undefined,
      endMs: Number.isFinite(Number(turn.endMs)) ? Number(turn.endMs) : undefined,
      text: typeof turn.text === 'string' ? turn.text : undefined,
    })),
    liveSpeakerTurns: realtime.state.liveSpeakerTurns,
    error: realtime.state.error,
  }), [
    realtime.state.asrText,
    realtime.state.connection,
    realtime.state.error,
    realtime.state.liveSpeakerTurns,
    realtime.state.mode,
    realtime.state.speakerTurns,
  ])

  useEffect(() => {
    if (isDesktopMainWindow || recoveryCheckedRef.current) return
    recoveryCheckedRef.current = true
    if (recordedAudio || recordingId) return
    let cancelled = false
    void loadRecordedAudio().then((saved) => {
      if (cancelled || !saved) return
      meetingSessionIdRef.current = saved.recovery.meetingSessionId || null
      setRecordedAudio(saved.recovery.id, saved.blob, saved.recovery.startedAt, saved.recovery.meetingSessionId)
      fail('A meeting recording was preserved and is ready to retry.')
    })
    return () => {
      cancelled = true
    }
  }, [fail, isDesktopMainWindow, recordedAudio, recordingId, setRecordedAudio])

  useEffect(() => {
    if (isDesktopMainWindow) return
    setElapsedSeconds(recorder.elapsedSeconds)
  }, [isDesktopMainWindow, recorder.elapsedSeconds, setElapsedSeconds])

  useEffect(() => {
    if (isDesktopMainWindow) return
    setLiveTranscript(liveTranscript)
  }, [isDesktopMainWindow, liveTranscript, setLiveTranscript])

  useEffect(() => {
    if (isDesktopMainWindow) return
    if (recorder.error) {
      fail(recorder.error)
    }
  }, [fail, isDesktopMainWindow, recorder.error])

  useEffect(() => {
    if (!isDesktopMainWindow) return
    let disposed = false
    let cleanup: (() => void) | undefined
    void listenRecorderWindowState(syncExternalState).then((unlisten) => {
      if (disposed) unlisten?.()
      else cleanup = unlisten
    })
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [isDesktopMainWindow, syncExternalState])

  useEffect(() => {
    if (!isDesktopMainWindow) return
    let disposed = false
    let cleanup: (() => void) | undefined
    void listenDesktopNavigation((route) => navigate(route)).then((unlisten) => {
      if (disposed) unlisten?.()
      else cleanup = unlisten
    })
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [isDesktopMainWindow, navigate])

  useEffect(() => {
    if (!isRecorderWindow) return
    let disposed = false
    let cleanup: (() => void) | undefined
    void listenRecorderOpenPanel(() => {
      if (!NATIVE_PROTECTED_PHASES.includes(useMeetingRecorderStore.getState().phase)) {
        resetSession()
        openPanel()
        void setRecorderWindowLayout('expanded')
      }
    }).then((unlisten) => {
      if (disposed) unlisten?.()
      else cleanup = unlisten
    })
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [isRecorderWindow, openPanel, resetSession])

  useEffect(() => {
    if (!isRecorderWindow) return
    void emitRecorderWindowState({
      isPanelOpen,
      isMinimized,
      phase,
      elapsedSeconds,
      taskId,
      noteId,
      recordingStartedAt,
      liveTranscript,
      error,
      notification,
    })
  }, [elapsedSeconds, error, isMinimized, isPanelOpen, isRecorderWindow, liveTranscript, noteId, notification, phase, recordingStartedAt, taskId])

  useEffect(() => {
    if (!isRecorderWindow) return
    void setRecorderActive(NATIVE_PROTECTED_PHASES.includes(phase) || (phase === 'failed' && Boolean(recordedAudio)))
    return () => {
      void setRecorderActive(false)
    }
  }, [isRecorderWindow, phase, recordedAudio])

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => clampPosition(current.x, current.y))
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragOffsetRef.current) {
        return
      }

      const next = clampPosition(
        event.clientX - dragOffsetRef.current.x,
        event.clientY - dragOffsetRef.current.y,
      )
      setPosition(next)
    }
    const handlePointerUp = () => {
      dragOffsetRef.current = null
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  const handleTaskProgress = useCallback((status: TaskStatusResponse) => {
    if (status.status === 'transcribing') {
      setPhase('transcribing')
    } else if (status.status === 'summarizing' || status.status === 'screenshots') {
      setPhase('summarizing')
    }
  }, [setPhase])

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) {
      return
    }

    if (isRecorderWindow) {
      void startCurrentRecorderWindowDrag()
      return
    }

    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    }
  }

  const handleStart = async () => {
    const previousRecordingId = recordingId
    resetSession()
    openPanel()
    startedAtRef.current = new Date()
    setRecordingStartedAt(startedAtRef.current.toISOString())
    setPhase('requesting')

    try {
      const preserved = previousRecordingId ? null : await loadRecordedAudio()
      supersededRecordingIdRef.current = previousRecordingId ?? preserved?.recovery.id ?? null
      pcmFramerRef.current = new RealtimePcmFramer()
      meetingSessionIdRef.current = null
      void realtime.start()
        .then((sessionId) => {
          meetingSessionIdRef.current = sessionId
          setMeetingSessionId(sessionId)
        })
        .catch(() => {
          realtime.markDegraded(copy.meetingRecorder.liveUnavailable)
        })
      await recorder.start()
      setPhase('recording')
    } catch (startError) {
      realtime.close(true)
      fail(formatRecorderFailure(
        startError,
        copy.meetingRecorder.unsupported,
        copy.meetingRecorder,
      ))
    }
  }

  useEffect(() => {
    if (!autoStart || !isRecorderWindow || autoStartHandledRef.current) return
    autoStartHandledRef.current = true
    void setRecorderWindowLayout('expanded').then(() => handleStart())
  }, [autoStart, isRecorderWindow])

  const handleLauncher = async () => {
    if (!isDesktopMainWindow) {
      await handleStart()
      return
    }
    await openRecorderWindow()
    await emitRecorderOpenPanel()
  }

  const handleMinimize = () => {
    minimizePanel()
    if (isRecorderWindow) void setRecorderWindowLayout('minimized')
  }

  const handleRestore = () => {
    restorePanel()
    if (isRecorderWindow) void setRecorderWindowLayout('expanded')
  }

  const handlePause = () => {
    pcmFramerRef.current.setPaused(true)
    recorder.pause()
    setPhase('paused')
  }

  const handleResume = () => {
    pcmFramerRef.current.setPaused(false)
    recorder.resume()
    setPhase('recording')
  }

  const submitPreservedRecording = async (
    audioBlob: Blob,
    startedAt: Date,
    storageId?: string,
    sessionId?: string,
  ) => {
    setPhase('uploading')
    const response = await submitMeetingRecording({
      audioBlob,
      startedAt,
      outputLanguage: language,
      summaryMode: 'default',
      workspace: currentWorkspace,
      meetingSessionId: sessionId,
    })
    setTaskId(response.task_id)
    const note = await completeMeetingRecordingGeneration({
      taskId: response.task_id,
      onProgress: handleTaskProgress,
    })
    realtime.close(false)
    if (storageId) await deleteRecordedAudio(storageId)
    complete(note.id)
  }

  const handleFinish = async () => {
    if (finishInFlightRef.current) {
      return
    }

    finishInFlightRef.current = true
    try {
      setPhase('stopping')
      const lastFrame = pcmFramerRef.current.finish()
      if (lastFrame) realtime.sendFrame(lastFrame)
      const audioBlob = await recorder.stop()
      if (audioBlob.size === 0) {
        throw new Error('microphone_no_audio')
      }
      const startedAt = startedAtRef.current || new Date()
      const id = generateRecordingId()
      const sessionId = meetingSessionIdRef.current
      await saveRecordedAudio({
        id,
        startedAt: startedAt.toISOString(),
        mimeType: audioBlob.type,
        meetingSessionId: sessionId || undefined,
      }, audioBlob)
      setRecordedAudio(id, audioBlob, startedAt.toISOString(), sessionId || undefined)
      const supersededId = supersededRecordingIdRef.current
      supersededRecordingIdRef.current = null
      if (supersededId && supersededId !== id) {
        void deleteRecordedAudio(supersededId).catch(() => undefined)
      }
      await submitPreservedRecording(audioBlob, startedAt, id, sessionId || undefined)
    } catch (finishError) {
      fail(formatRecorderFailure(
        finishError,
        copy.meetingRecorder.saveFailed,
        copy.meetingRecorder,
      ))
    } finally {
      finishInFlightRef.current = false
    }
  }

  const handleRetry = async () => {
    let audio = recordedAudio
    let startedAt = recordingStartedAt
    let storageId = recordingId
    let sessionId = meetingSessionId
    if (!audio) {
      const saved = await loadRecordedAudio()
      if (saved) {
        audio = saved.blob
        startedAt = saved.recovery.startedAt
        storageId = saved.recovery.id
        sessionId = saved.recovery.meetingSessionId
        meetingSessionIdRef.current = sessionId || null
        setRecordedAudio(saved.recovery.id, saved.blob, saved.recovery.startedAt, sessionId)
      }
    }
    if (!audio) {
      recorder.reset()
      resetSession()
      await handleStart()
      return
    }
    try {
      await submitPreservedRecording(audio, startedAt ? new Date(startedAt) : new Date(), storageId, sessionId)
    } catch (retryError) {
      fail(formatRecorderFailure(retryError, copy.meetingRecorder.saveFailed, copy.meetingRecorder))
    }
  }

  const handleViewNote = () => {
    if (!notification?.noteId) {
      return
    }

    const route = `/note/${notification.noteId}`
    if (isRecorderWindow) void showMainWindow(route)
    else navigate(route)
    dismissNotification()
    closePanel()
  }

  const handleViewLiveTranscript = () => {
    const route = '/recording/live?view=transcript'
    if (isRecorderWindow) void showMainWindow(route)
    else navigate(route)
  }

  const handleClose = () => {
    realtime.close(true)
    meetingSessionIdRef.current = null
    recorder.reset()
    resetSession()
    if (isRecorderWindow) {
      void setRecorderActive(false).then(() => closeCurrentRecorderWindow())
    }
  }

  const elapsedLabel = formatElapsedTime(elapsedSeconds)
  const isProcessing = PROCESSING_PHASES.includes(phase)
  const canFinish = phase === 'recording' || phase === 'paused'
  const canClose = phase === 'idle' || phase === 'completed' || phase === 'failed'
  const statusLabel = copy.meetingRecorder[phaseToCopyKey(phase)]

  return (
    <>
      {(!isPanelOpen || isDesktopMainWindow) && !isRecorderWindow ? (
        <button
          type="button"
          onClick={() => void handleLauncher()}
          aria-label={copy.meetingRecorder.openPanel}
          className="fixed bottom-6 right-6 z-50 inline-flex h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 shadow-lg shadow-gray-900/10 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100 dark:shadow-black/30 dark:hover:bg-[#2a2a2a]"
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Mic className="h-4 w-4" />
          </span>
          {copy.meetingRecorder.title}
        </button>
      ) : null}

      {isPanelOpen && isMinimized && !isDesktopMainWindow ? (
        <button
          type="button"
          onClick={handleRestore}
          aria-label={copy.meetingRecorder.restore}
          className={clsx(
            'z-50 inline-flex h-14 min-w-14 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 shadow-lg shadow-gray-900/10 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100 dark:shadow-black/30 dark:hover:bg-[#2a2a2a]',
            isRecorderWindow ? 'relative m-1' : 'fixed',
          )}
          style={isRecorderWindow ? undefined : { left: position.x, top: position.y }}
        >
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            {phase === 'recording' ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" /> : null}
            <Mic className="h-4 w-4" />
          </span>
          {phase !== 'idle' ? <span className="tabular-nums">{elapsedLabel}</span> : null}
        </button>
      ) : null}

      {isPanelOpen && !isMinimized && !isDesktopMainWindow ? (
        <section
          aria-label={copy.meetingRecorder.title}
          data-testid={isRecorderWindow ? 'meeting-recorder-native-surface' : undefined}
          className={clsx(
            'z-50 w-80 rounded-lg border border-gray-200 bg-white p-3 text-gray-900 shadow-xl shadow-gray-900/12 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100 dark:shadow-black/30',
            isRecorderWindow ? 'relative m-0 h-full w-full rounded-none shadow-none' : 'fixed',
          )}
          style={isRecorderWindow ? undefined : { left: position.x, top: position.y }}
        >
          <div
            data-testid={isRecorderWindow ? 'recorder-drag-handle' : undefined}
            data-tauri-drag-region={isRecorderWindow ? true : undefined}
            className="flex cursor-move items-center justify-between gap-2 pb-2"
            onPointerDown={handlePointerDown}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className={clsx(
                'relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                phase === 'recording'
                  ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                  : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
              )}>
                {phase === 'recording' ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" /> : null}
                <Mic className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{copy.meetingRecorder.title}</div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{statusLabel}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {phase === 'recording' || phase === 'paused' ? (
                <button
                  type="button"
                  onClick={handleViewLiveTranscript}
                  aria-label={copy.meetingRecorder.openLiveTranscript}
                  title={copy.meetingRecorder.openLiveTranscript}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
                >
                  <MessageSquareText className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleMinimize}
                aria-label={copy.meetingRecorder.minimize}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleClose}
                aria-label={copy.meetingRecorder.close}
                disabled={!canClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-[#191919]">
            <div>
              <div className="font-mono text-xl font-semibold tabular-nums">{elapsedLabel}</div>
              {taskId ? <div className="mt-0.5 max-w-[150px] truncate text-[11px] text-gray-400">{taskId}</div> : null}
            </div>
            <div className="flex h-8 items-end gap-1" aria-hidden="true">
              {WAVEFORM_BAR_HEIGHTS.map((height, index) => (
                <span
                  key={`wave-${index}`}
                  className={clsx(
                    'w-1 rounded-full bg-emerald-500/80',
                    phase === 'recording' ? 'animate-pulse' : 'opacity-40',
                  )}
                  style={{
                    height,
                    animationDelay: `${index * 90}ms`,
                  }}
                />
              ))}
            </div>
          </div>

          {phase === 'failed' && error ? (
            <div className="mt-2 flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="line-clamp-2">{error}</span>
            </div>
          ) : null}

          {isProcessing ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {copy.meetingRecorder.processingHint}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end gap-2">
            {phase === 'idle' || phase === 'completed' ? (
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!recorder.isSupported}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mic className="h-4 w-4" />
                {copy.meetingRecorder.start}
              </button>
            ) : null}
            {phase === 'failed' ? (
              <button
                type="button"
                onClick={() => void handleRetry()}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
              >
                <RotateCcw className="h-4 w-4" />
                {copy.meetingRecorder.retry}
              </button>
            ) : null}
            {phase === 'recording' ? (
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200 dark:bg-[#2a2a2a] dark:text-gray-200 dark:hover:bg-gray-700"
                aria-label={copy.meetingRecorder.pause}
              >
                <Pause className="h-4 w-4" />
              </button>
            ) : null}
            {phase === 'paused' ? (
              <button
                type="button"
                onClick={handleResume}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200 dark:bg-[#2a2a2a] dark:text-gray-200 dark:hover:bg-gray-700"
                aria-label={copy.meetingRecorder.resume}
              >
                <Play className="h-4 w-4" />
              </button>
            ) : null}
            {canFinish ? (
              <button
                type="button"
                onClick={() => void handleFinish()}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition hover:bg-red-700"
              >
                <Square className="h-4 w-4" />
                {copy.meetingRecorder.finish}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {notification ? (
        <div
          role="status"
          className="fixed right-6 top-16 z-50 w-80 rounded-lg border border-gray-200 bg-white p-3 text-gray-900 shadow-xl shadow-gray-900/12 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100 dark:shadow-black/30"
        >
          <div className="flex gap-3">
            <span className={clsx(
              'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              notification.kind === 'success'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
            )}>
              {notification.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                {notification.kind === 'success' ? copy.meetingRecorder.doneTitle : copy.meetingRecorder.failedTitle}
              </div>
              {notification.message ? (
                <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{notification.message}</div>
              ) : null}
              <div className="mt-3 flex items-center gap-2">
                {notification.noteId ? (
                  <button
                    type="button"
                    onClick={handleViewNote}
                    className="inline-flex h-8 items-center rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                  >
                    {copy.meetingRecorder.viewNote}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={dismissNotification}
                  className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
                >
                  {copy.meetingRecorder.close}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
