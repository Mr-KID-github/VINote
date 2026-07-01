import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Mic, Minus, Pause, Play, RotateCcw, Square } from 'lucide-react'
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

const PANEL_WIDTH = 520
const PANEL_HEIGHT = 150
const EDGE_PADDING = 24
const WAVEFORM_BAR_HEIGHTS = [6, 10, 8, 22, 34, 16, 8, 10, 28, 40, 16, 26, 12, 18, 9, 8, 30, 36, 18, 12, 8, 7] as const
const PROCESSING_PHASES: MeetingRecorderPhase[] = ['requesting', 'stopping', 'uploading', 'transcribing', 'summarizing', 'saving']

function getInitialPosition() {
  if (typeof window === 'undefined') return { x: EDGE_PADDING, y: EDGE_PADDING }
  return {
    x: Math.max(EDGE_PADDING, Math.floor((window.innerWidth - PANEL_WIDTH) / 2)),
    y: Math.max(EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - 88),
  }
}

function clampPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y }
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
    taskId,
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    dragOffsetRef.current = { x: event.clientX - position.x, y: event.clientY - position.y }
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

  const handleFinish = async () => {
    if (finishInFlightRef.current) return
    finishInFlightRef.current = true
    try {
      setPhase('stopping')
      const audioBlob = await recorder.stop()
      if (audioBlob.size === 0) throw new Error('microphone_no_audio')
      setRecordedAudio(audioBlob)
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
      setPhase('uploading')
      const response = await submitMeetingRecording({
        audioBlob: state.recordedAudio,
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
      complete(note.id)
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
  const canFinish = phase === 'recording' || phase === 'paused'
  const statusLabel = phaseLabel(phase, recorderCopy)

  return (
    <>
      {!isPanelOpen ? (
        <button
          type="button"
          onClick={() => void handleStart()}
          aria-label={recorderCopy.openPanel}
          className="fixed bottom-6 right-6 z-50 inline-flex h-[72px] items-center gap-6 rounded-full border border-white/80 bg-white px-6 pr-7 text-[22px] font-medium text-[#111827] shadow-[0_16px_38px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(15,23,42,0.18)]"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F7F5] text-[#0EA5A6]">
            <Mic className="h-7 w-7" strokeWidth={2.6} />
          </span>
          <span>{recorderCopy.title}</span>
          <span className="h-3 w-3 rounded-full bg-[#EF2B2D] shadow-[0_0_0_5px_rgba(239,43,45,0.10)]" />
          <span className="font-mono text-[22px] font-normal tabular-nums text-[#8B9099]">{elapsedLabel}</span>
          <ChevronDown className="h-7 w-7 text-[#111827]" />
        </button>
      ) : null}

      {isPanelOpen && isMinimized ? (
        <button
          type="button"
          onClick={restorePanel}
          aria-label={recorderCopy.restore}
          className="fixed z-50 inline-flex h-[76px] w-[76px] items-center justify-center rounded-full border border-white/80 bg-white text-[#0EA5A6] shadow-[0_14px_32px_rgba(15,23,42,0.16)]"
          style={{ left: position.x, top: position.y }}
        >
          <span className="absolute right-2 top-2 h-3.5 w-3.5 rounded-full bg-[#EF2B2D] shadow-[0_0_0_4px_rgba(239,43,45,0.12)]" />
          <span className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#F9FAFB] ring-1 ring-gray-100">
            <Mic className="h-9 w-9" strokeWidth={2.6} />
          </span>
        </button>
      ) : null}

      {isPanelOpen && !isMinimized ? (
        <section
          aria-label={recorderCopy.title}
          className="fixed z-50 w-[520px] max-w-[calc(100vw-32px)] rounded-[18px] border border-white/80 bg-white px-6 py-5 text-[#111827] shadow-[0_18px_44px_rgba(15,23,42,0.14)]"
          style={{ left: position.x, top: position.y }}
        >
          <div className="absolute right-4 top-3">
            <button type="button" onClick={minimizePanel} aria-label={recorderCopy.minimize} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#8B9099] hover:bg-gray-100">
              <Minus className="h-5 w-5" />
            </button>
          </div>
          <div className="flex items-center gap-6" onPointerDown={handlePointerDown}>
            <div className="inline-flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full bg-[#E5F7F5] text-[#0EA5A6]">
              <Mic className="h-12 w-12" strokeWidth={2.6} />
            </div>
            <div className="h-[96px] w-px bg-gray-200" />
            <div className="min-w-0 flex-1">
              <div className="text-[20px] font-medium leading-6">{recorderCopy.title}</div>
              <div className="mt-4 flex items-center gap-4">
                <span className="h-3 w-3 rounded-full bg-[#EF2B2D] shadow-[0_0_0_5px_rgba(239,43,45,0.10)]" />
                <span className="font-mono text-[30px] font-semibold leading-none tabular-nums tracking-tight">{elapsedLabel}</span>
              </div>
              <div className="mt-5 flex h-10 items-center gap-1 overflow-hidden" aria-label={recorderCopy.waveformLabel}>
                {WAVEFORM_BAR_HEIGHTS.map((height, index) => (
                  <span
                    key={`wave-${index}`}
                    className={clsx('w-1 rounded-full bg-[#0EA5A6]', phase === 'recording' ? 'animate-pulse' : 'opacity-45')}
                    style={{ height, animationDelay: `${index * 60}ms` }}
                  />
                ))}
              </div>
              <div className="mt-2 text-xs text-[#8B9099]">{statusLabel}{taskId ? ` · ${taskId}` : ''}</div>
            </div>
            <div className="ml-2 flex shrink-0 items-center gap-6">
              <button
                type="button"
                onClick={phase === 'paused' ? handleResume : handlePause}
                disabled={phase !== 'recording' && phase !== 'paused'}
                aria-label={phase === 'paused' ? recorderCopy.resume : recorderCopy.pause}
                className="group flex flex-col items-center gap-2 text-[15px] text-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm group-hover:bg-gray-50">
                  {phase === 'paused' ? <Play className="h-7 w-7" fill="currentColor" /> : <Pause className="h-7 w-7" fill="currentColor" />}
                </span>
                {phase === 'paused' ? recorderCopy.resume : recorderCopy.pause}
              </button>
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={!canFinish || finishInFlightRef.current}
                aria-label={recorderCopy.end}
                className="group flex flex-col items-center gap-2 text-[15px] text-[#111827] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#EF2B2D] text-white shadow-[0_10px_20px_rgba(239,43,45,0.22)] group-hover:bg-[#dc2626]">
                  {isProcessing ? <Loader2 className="h-7 w-7 animate-spin" /> : <Square className="h-6 w-6" fill="currentColor" />}
                </span>
                {recorderCopy.end}
              </button>
            </div>
          </div>

          {isProcessing ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-[#6B7280]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {recorderCopy.processingHint}: {statusLabel}
            </div>
          ) : null}
          {phase === 'failed' && error ? (
            <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              <div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span></div>
              {retryDescription ? <div className="mt-1 pl-6 text-xs">{retryDescription}</div> : null}
            </div>
          ) : null}
          {notification?.kind === 'success' ? (
            <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{recorderCopy.completedNotice}</span>
              <button type="button" onClick={handleViewNote} className="font-medium underline underline-offset-2" aria-label={recorderCopy.viewNote}>{recorderCopy.viewNote}</button>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={requestClose} className="text-sm text-[#6B7280] hover:text-[#111827]">{recorderCopy.close}</button>
            {phase === 'failed' ? (
              <button type="button" onClick={() => void handleRetry()} className="inline-flex items-center gap-2 rounded-full bg-[#111827] px-4 py-2 text-sm font-medium text-white">
                <RotateCcw className="h-4 w-4" />{recorderCopy.retry}
              </button>
            ) : null}
          </div>
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
