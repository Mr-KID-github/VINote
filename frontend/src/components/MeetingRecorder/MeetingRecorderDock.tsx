import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CheckCircle2, ChevronDown, Loader2, Mic, Minus, Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { MeetingGenerationError, completeMeetingRecordingGeneration, submitMeetingRecording } from '../../lib/meetingGeneration'
import { useI18n } from '../../lib/i18n'
import { useMeetingRecorderStore, type MeetingRecorderPhase, type MeetingRecorderStage } from '../../stores/meetingRecorderStore'
import { useModelProfileStore } from '../../stores/modelProfileStore'
import { useNoteLibraryStore } from '../../stores/noteLibraryStore'
import { useSTTProfileStore } from '../../stores/sttProfileStore'
import { useTeamStore } from '../../stores/teamStore'

const PANEL_WIDTH = 360
const PANEL_HEIGHT = 180
const EDGE_PADDING = 20
const WAVEFORM_BAR_HEIGHTS = [4, 7, 5, 14, 21, 10, 5, 7, 17, 24, 10, 16, 8, 11, 6, 5, 18, 22, 11, 8, 5, 4] as const
const PROCESSING_PHASES: MeetingRecorderPhase[] = ['requesting', 'stopping', 'uploading', 'transcribing', 'summarizing', 'saving']

function getInitialPosition() {
  if (typeof window === 'undefined') return { x: EDGE_PADDING, y: EDGE_PADDING }
  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - PANEL_WIDTH - EDGE_PADDING),
    y: Math.max(EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - EDGE_PADDING),
  }
}

function clampPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y }
  return {
    x: Math.min(Math.max(EDGE_PADDING, x), Math.max(EDGE_PADDING, window.innerWidth - PANEL_WIDTH - EDGE_PADDING)),
    y: Math.min(Math.max(EDGE_PADDING, y), Math.max(EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - EDGE_PADDING)),
  }
}

function formatElapsedTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatRecorderFailure(error: unknown, copy: ReturnType<typeof useI18n>['copy']['meetingRecorder']) {
  const message = error instanceof Error ? error.message : String(error || '')
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid api key') || normalized.includes('unauthorized') || normalized.includes('401')) {
    return copy.modelConfigRequired
  }
  if (normalized.includes('microphone_denied')) return copy.microphoneDenied
  if (normalized.includes('microphone_unsupported')) return copy.unsupported
  if (normalized.includes('microphone_no-device') || normalized.includes('microphone_no_audio')) return copy.microphoneNoAudio
  if (normalized.includes('microphone_unavailable')) return copy.microphoneUnavailable
  return message || copy.unknownError
}

function stageFromError(error: unknown): MeetingRecorderStage {
  if (error instanceof MeetingGenerationError) return error.stage
  return 'summarizing'
}

function phaseLabel(phase: MeetingRecorderPhase, copy: ReturnType<typeof useI18n>['copy']['meetingRecorder']) {
  return copy.phases?.[phase] || phase
}

export function MeetingRecorderDock() {
  const navigate = useNavigate()
  const recorder = useAudioRecorder()
  const { copy, language } = useI18n()
  const recorderCopy = copy.meetingRecorder
  const { saveNote } = useNoteLibraryStore()
  const { currentWorkspace } = useTeamStore()
  const {
    selectedProfileId: selectedModelProfileId,
    loadProfiles: loadModelProfiles,
  } = useModelProfileStore()
  const {
    selectedProfileId: selectedSTTProfileId,
    loadProfiles: loadSTTProfiles,
  } = useSTTProfileStore()
  const {
    isPanelOpen,
    isMinimized,
    confirmDiscardOpen,
    phase,
    elapsedSeconds,
    error,
    retryDescription,
    notification,
    openPanel,
    requestClose,
    cancelCloseRequest,
    discardSession,
    minimizePanel,
    restorePanel,
    setPhase,
    setElapsedSeconds,
    setTaskId,
    setRecordedAudio,
    setGeneratedNote,
    complete,
    failStage,
    dismissNotification,
    resetSession,
  } = useMeetingRecorderStore()
  const [position, setPosition] = useState(getInitialPosition)
  const [hasCustomPosition, setHasCustomPosition] = useState(false)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const startedAtRef = useRef<Date | null>(null)
  const finishInFlightRef = useRef(false)

  useEffect(() => {
    void loadModelProfiles()
    void loadSTTProfiles()
  }, [loadModelProfiles, loadSTTProfiles])

  useEffect(() => {
    setElapsedSeconds(recorder.elapsedSeconds)
  }, [recorder.elapsedSeconds, setElapsedSeconds])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const state = useMeetingRecorderStore.getState()
      if (state.hasRecoverableRecording) {
        event.preventDefault()
        event.returnValue = recorderCopy.beforeUnload
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [recorderCopy.beforeUnload])

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current.x, current.y))
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragOffsetRef.current) return
      setPosition(clampPosition(event.clientX - dragOffsetRef.current.x, event.clientY - dragOffsetRef.current.y))
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

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = hasCustomPosition ? position : getInitialPosition()
    setPosition(current)
    setHasCustomPosition(true)
    dragOffsetRef.current = { x: event.clientX - current.x, y: event.clientY - current.y }
  }

  const handlePanelPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    beginDrag(event)
  }

  const handleOpenLauncher = () => {
    resetSession()
    setPosition(getInitialPosition())
    setHasCustomPosition(false)
    openPanel()
    setPhase('idle')
  }

  const handleStart = async () => {
    startedAtRef.current = new Date()
    setPhase('requesting')
    try {
      await recorder.start()
      setPhase('recording')
    } catch (startError) {
      failStage('uploading', formatRecorderFailure(startError, recorderCopy))
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

  const handleStop = async () => {
    if (finishInFlightRef.current) return
    finishInFlightRef.current = true
    try {
      setPhase('stopping')
      const audioBlob = await recorder.stop()
      if (audioBlob.size === 0) throw new Error('microphone_no_audio')
      setRecordedAudio(audioBlob)
      setPhase('stopped')
    } catch (stopError) {
      failStage('uploading', formatRecorderFailure(stopError, recorderCopy))
    } finally {
      finishInFlightRef.current = false
    }
  }

  const generateFromAudio = async (audioBlob: Blob) => {
    setPhase('uploading')
    const response = await submitMeetingRecording({
      audioBlob,
      startedAt: startedAtRef.current || new Date(),
      outputLanguage: language,
      summaryMode: 'default',
      modelProfileId: selectedModelProfileId || undefined,
      sttProfileId: selectedSTTProfileId || undefined,
    }, { onStage: setPhase })
    setTaskId(response.task_id)
    const note = await completeMeetingRecordingGeneration({
      taskId: response.task_id,
      workspace: currentWorkspace,
      saveNote,
      onStage: setPhase,
    })
    setGeneratedNote({ title: note.title, markdown: note.content, taskId: response.task_id })
    complete(note.id)
  }

  const handleFinish = async () => {
    if (finishInFlightRef.current) return
    finishInFlightRef.current = true
    try {
      let audioBlob = useMeetingRecorderStore.getState().recordedAudio
      if (!audioBlob && (phase === 'recording' || phase === 'paused')) {
        setPhase('stopping')
        audioBlob = await recorder.stop()
        if (audioBlob.size === 0) throw new Error('microphone_no_audio')
        setRecordedAudio(audioBlob)
      }
      if (!audioBlob) throw new Error(recorderCopy.noRecoverableAudio)
      await generateFromAudio(audioBlob)
    } catch (finishError) {
      failStage(stageFromError(finishError), formatRecorderFailure(finishError, recorderCopy))
    } finally {
      finishInFlightRef.current = false
    }
  }

  const handleRetry = async () => {
    const state = useMeetingRecorderStore.getState()
    if (finishInFlightRef.current) return
    finishInFlightRef.current = true
    try {
      if (state.failedStage === 'saving' && state.generatedNote) {
        setPhase('saving')
        const note = await saveNote(
          state.generatedNote.title,
          state.generatedNote.markdown,
          undefined,
          state.generatedNote.taskId,
          currentWorkspace,
          'meeting_recording',
        )
        if (!note) throw new MeetingGenerationError('saving', recorderCopy.saveFailed)
        complete(note.id)
        return
      }
      if ((state.failedStage === 'transcribing' || state.failedStage === 'summarizing') && state.taskId) {
        const note = await completeMeetingRecordingGeneration({
          taskId: state.taskId,
          workspace: currentWorkspace,
          saveNote,
          onStage: setPhase,
        })
        complete(note.id)
        return
      }
      if (!state.recordedAudio) {
        throw new Error(recorderCopy.noRecoverableAudio)
      }
      await generateFromAudio(state.recordedAudio)
    } catch (retryError) {
      failStage(stageFromError(retryError), formatRecorderFailure(retryError, recorderCopy))
    } finally {
      finishInFlightRef.current = false
    }
  }

  const handleViewNote = () => {
    if (!notification?.noteId) return
    navigate(`/note/${notification.noteId}`)
    dismissNotification()
    requestClose()
  }

  const handleDiscard = () => {
    recorder.reset()
    discardSession()
  }

  const elapsedLabel = formatElapsedTime(elapsedSeconds)
  const isProcessing = PROCESSING_PHASES.includes(phase)
  const canStart = phase === 'idle' || phase === 'failed'
  const canStop = phase === 'paused'
  const canFinish = phase === 'stopped'
  const statusLabel = phaseLabel(phase, recorderCopy)
  const statusText = phase === 'failed' && error
    ? `${error}${retryDescription ? ` · ${retryDescription}` : ''}`
    : notification?.kind === 'success'
      ? recorderCopy.completedNotice
      : isProcessing
        ? `${recorderCopy.processingHint}: ${statusLabel}`
        : statusLabel
  const dockedStyle = hasCustomPosition ? { left: position.x, top: position.y } : { right: EDGE_PADDING, bottom: EDGE_PADDING }

  return (
    <>
      {!isPanelOpen ? (
        <button
          type="button"
          onClick={handleOpenLauncher}
          aria-label={recorderCopy.openPanel}
          className="fixed bottom-5 right-5 z-50 inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/80 bg-white text-[#0EA5A6] shadow-[0_8px_20px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(15,23,42,0.16)]"
        >
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#EF2B2D] shadow-[0_0_0_3px_rgba(239,43,45,0.12)]" />
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#F9FAFB] ring-1 ring-gray-100">
            <Mic className="h-6 w-6" strokeWidth={2.6} />
          </span>
        </button>
      ) : null}

      {isPanelOpen && isMinimized ? (
        <div
          className="fixed z-50 inline-flex h-12 items-center gap-3 rounded-full border border-white/80 bg-white px-3.5 pr-4 text-base font-medium text-[#111827] shadow-[0_8px_22px_rgba(15,23,42,0.14)]"
          style={dockedStyle}
        >
          <span
            aria-label={recorderCopy.minimizedDragHandle}
            role="button"
            tabIndex={0}
            onPointerDown={beginDrag}
            className="-ml-1 h-6 w-2 cursor-grab rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.16)] transition-all hover:w-3 active:cursor-grabbing"
          />
          <button type="button" onClick={restorePanel} aria-label={recorderCopy.restore} className="inline-flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#E5F7F5] text-[#0EA5A6]">
              <Mic className="h-5 w-5" strokeWidth={2.6} />
            </span>
            <span>{recorderCopy.title}</span>
            <span className="h-2.5 w-2.5 rounded-full bg-[#EF2B2D] shadow-[0_0_0_4px_rgba(239,43,45,0.10)]" />
            <span className="font-mono text-sm font-normal tabular-nums text-[#8B9099]">{elapsedLabel}</span>
            <ChevronDown className="h-5 w-5 text-[#111827]" />
          </button>
        </div>
      ) : null}

      {isPanelOpen && !isMinimized ? (
        <section
          aria-label={recorderCopy.title}
          className="fixed z-50 w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-white/80 bg-white px-4 py-3 text-[#111827] shadow-[0_12px_28px_rgba(15,23,42,0.14)]"
          style={dockedStyle}
        >
          <div className="absolute right-3 top-2.5 flex items-center gap-2.5">
            <button type="button" onClick={minimizePanel} aria-label={recorderCopy.minimize} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#8B9099] hover:bg-gray-100">
              <Minus className="h-4 w-4" />
            </button>
            <button type="button" onClick={requestClose} aria-label={recorderCopy.close} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#8B9099] hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3" onPointerDown={handlePanelPointerDown}>
            <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E5F7F5] text-[#0EA5A6]">
              <Mic className="h-7 w-7" strokeWidth={2.6} />
            </div>
            <div className="h-16 w-px bg-gray-200" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-5">{recorderCopy.title}</div>
              <div className="mt-2 flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#EF2B2D] shadow-[0_0_0_4px_rgba(239,43,45,0.10)]" />
                <span className="font-mono text-xl font-semibold leading-none tabular-nums tracking-tight">{elapsedLabel}</span>
              </div>
              <div className="mt-3 flex h-6 items-center gap-0.5 overflow-hidden" aria-label={recorderCopy.waveformLabel}>
                {WAVEFORM_BAR_HEIGHTS.map((height, index) => (
                  <span
                    key={`wave-${index}`}
                    className={clsx('w-0.5 rounded-full bg-[#0EA5A6]', phase === 'recording' ? 'animate-pulse' : 'opacity-45')}
                    style={{ height, animationDelay: `${index * 60}ms` }}
                  />
                ))}
              </div>
              <div data-testid="meeting-recorder-status" className={clsx('mt-1 max-w-[150px] truncate text-[11px]', phase === 'failed' ? 'text-red-600' : 'text-[#8B9099]')} title={statusText}>
                {statusText}
              </div>
            </div>
            <div className="ml-2 flex shrink-0 items-center gap-4">
              <button
                type="button"
                onClick={canStart ? () => void handleStart() : phase === 'paused' ? handleResume : handlePause}
                disabled={isProcessing || phase === 'completed' || phase === 'stopped'}
                aria-label={canStart ? recorderCopy.start : phase === 'paused' ? recorderCopy.resume : recorderCopy.pause}
                className="group flex flex-col items-center gap-1 text-xs text-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm group-hover:bg-gray-50">
                  {canStart || phase === 'paused' ? <Play className="h-5 w-5" fill="currentColor" /> : <Pause className="h-5 w-5" fill="currentColor" />}
                </span>
                {canStart ? recorderCopy.start : phase === 'paused' ? recorderCopy.resume : recorderCopy.pause}
              </button>
              <button
                type="button"
                onClick={phase === 'failed' ? () => void handleRetry() : phase === 'stopped' ? () => void handleFinish() : () => void handleStop()}
                disabled={isProcessing || (!canStop && !canFinish && phase !== 'failed')}
                aria-label={phase === 'failed' ? recorderCopy.retry : phase === 'stopped' ? recorderCopy.finish : recorderCopy.stop}
                className="group flex flex-col items-center gap-1 text-xs text-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className={clsx('inline-flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_8px_16px_rgba(239,43,45,0.22)]', phase === 'failed' ? 'bg-[#111827]' : 'bg-[#EF2B2D] group-hover:bg-[#dc2626]')}>
                  {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : phase === 'failed' ? <RotateCcw className="h-4 w-4" /> : phase === 'stopped' ? <CheckCircle2 className="h-5 w-5" /> : <Square className="h-4 w-4" fill="currentColor" />}
                </span>
                {phase === 'failed' ? recorderCopy.retry : phase === 'stopped' ? recorderCopy.finish : recorderCopy.stop}
              </button>
            </div>
          </div>

          {notification?.kind === 'success' ? (
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={handleViewNote} className="text-xs font-medium text-emerald-700 underline underline-offset-2" aria-label={recorderCopy.viewNote}>{recorderCopy.viewNote}</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {confirmDiscardOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4">
          <div role="dialog" aria-modal="true" aria-label={recorderCopy.discardTitle} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#111827]">{recorderCopy.discardTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-[#4B5563]">{recorderCopy.discardBody}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={cancelCloseRequest} className="rounded-lg px-4 py-2 text-sm text-[#374151] hover:bg-gray-100">{recorderCopy.keepRecording}</button>
              <button type="button" onClick={handleDiscard} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">{recorderCopy.discard}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
