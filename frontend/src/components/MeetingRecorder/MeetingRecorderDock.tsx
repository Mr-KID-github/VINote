import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Mic, Minimize2, Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { useI18n } from '../../lib/i18n'
import { completeMeetingRecordingGeneration, submitMeetingRecording } from '../../lib/meetingGeneration'
import type { TaskStatusResponse } from '../../lib/noteGenerationClient'
import { useMeetingRecorderStore, type MeetingRecorderPhase } from '../../stores/meetingRecorderStore'
import { useNoteLibraryStore } from '../../stores/noteLibraryStore'
import { useTeamStore } from '../../stores/teamStore'

const PANEL_WIDTH = 320
const PANEL_HEIGHT = 152
const EDGE_PADDING = 16

const PROCESSING_PHASES: MeetingRecorderPhase[] = ['requesting', 'stopping', 'uploading', 'transcribing', 'summarizing']
const WAVEFORM_BAR_HEIGHTS = [12, 20, 14, 26, 18, 24, 10] as const

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
    modelConfigRequired: string
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
    return copy.modelConfigRequired
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

export function MeetingRecorderDock() {
  const navigate = useNavigate()
  const recorder = useAudioRecorder()
  const { copy, language } = useI18n()
  const { saveNote } = useNoteLibraryStore()
  const { currentWorkspace } = useTeamStore()
  const {
    isPanelOpen,
    isMinimized,
    phase,
    elapsedSeconds,
    taskId,
    error,
    notification,
    openPanel,
    closePanel,
    minimizePanel,
    restorePanel,
    setPhase,
    setElapsedSeconds,
    setTaskId,
    complete,
    fail,
    dismissNotification,
    resetSession,
  } = useMeetingRecorderStore()
  const [position, setPosition] = useState(getInitialPosition)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const startedAtRef = useRef<Date | null>(null)
  const finishInFlightRef = useRef(false)


  useEffect(() => {
    setElapsedSeconds(recorder.elapsedSeconds)
  }, [recorder.elapsedSeconds, setElapsedSeconds])

  useEffect(() => {
    if (recorder.error) {
      fail(recorder.error)
    }
  }, [fail, recorder.error])

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

    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    }
  }

  const handleStart = async () => {
    resetSession()
    openPanel()
    startedAtRef.current = new Date()
    setPhase('requesting')

    try {
      await recorder.start()
      setPhase('recording')
    } catch (startError) {
      fail(formatRecorderFailure(
        startError,
        copy.meetingRecorder.unsupported,
        copy.meetingRecorder,
      ))
    }
  }

  const handlePause = () => {
    recorder.pause()
    setPhase('paused')
  }

  const handleResume = () => {
    recorder.resume()
    setPhase('recording')
  }

  const handleFinish = async () => {
    if (finishInFlightRef.current) {
      return
    }

    finishInFlightRef.current = true
    try {
      setPhase('stopping')
      const audioBlob = await recorder.stop()
      if (audioBlob.size === 0) {
        throw new Error('microphone_no_audio')
      }
      setPhase('uploading')
      const response = await submitMeetingRecording({
        audioBlob,
        startedAt: startedAtRef.current || new Date(),
        outputLanguage: language,
        summaryMode: 'default',
      })
      setTaskId(response.task_id)

      const note = await completeMeetingRecordingGeneration({
        taskId: response.task_id,
        workspace: currentWorkspace,
        saveNote,
        onProgress: handleTaskProgress,
      })
      complete(note.id)
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

  const handleRetry = () => {
    recorder.reset()
    resetSession()
    openPanel()
  }

  const handleViewNote = () => {
    if (!notification?.noteId) {
      return
    }

    navigate(`/note/${notification.noteId}`)
    dismissNotification()
    closePanel()
  }

  const handleClose = () => {
    recorder.reset()
    resetSession()
  }

  const elapsedLabel = formatElapsedTime(elapsedSeconds)
  const isProcessing = PROCESSING_PHASES.includes(phase)
  const canFinish = phase === 'recording' || phase === 'paused'
  const canClose = phase === 'idle' || phase === 'completed' || phase === 'failed'
  const statusLabel = copy.meetingRecorder[phaseToCopyKey(phase)]

  return (
    <>
      {!isPanelOpen ? (
        <button
          type="button"
          onClick={() => void handleStart()}
          aria-label={copy.meetingRecorder.openPanel}
          className="fixed bottom-6 right-6 z-50 inline-flex h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 shadow-lg shadow-gray-900/10 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100 dark:shadow-black/30 dark:hover:bg-[#2a2a2a]"
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Mic className="h-4 w-4" />
          </span>
          {copy.meetingRecorder.title}
        </button>
      ) : null}

      {isPanelOpen && isMinimized ? (
        <button
          type="button"
          onClick={restorePanel}
          aria-label={copy.meetingRecorder.restore}
          className="fixed z-50 inline-flex h-14 min-w-14 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 shadow-lg shadow-gray-900/10 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100 dark:shadow-black/30 dark:hover:bg-[#2a2a2a]"
          style={{ left: position.x, top: position.y }}
        >
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            {phase === 'recording' ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" /> : null}
            <Mic className="h-4 w-4" />
          </span>
          {phase !== 'idle' ? <span className="tabular-nums">{elapsedLabel}</span> : null}
        </button>
      ) : null}

      {isPanelOpen && !isMinimized ? (
        <section
          aria-label={copy.meetingRecorder.title}
          className="fixed z-50 w-80 rounded-lg border border-gray-200 bg-white p-3 text-gray-900 shadow-xl shadow-gray-900/12 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100 dark:shadow-black/30"
          style={{ left: position.x, top: position.y }}
        >
          <div
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
              <button
                type="button"
                onClick={minimizePanel}
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
                onClick={handleRetry}
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
