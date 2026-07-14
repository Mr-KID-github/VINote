import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createMeetingRecordingTitle } from '../lib/meetingGeneration'
import { useI18n } from '../lib/i18n'
import { useMeetingRecorderStore, type LiveMeetingTranscriptTurn } from '../stores/meetingRecorderStore'

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatTimestamp(value: number | undefined) {
  const totalSeconds = Math.max(0, Math.floor((value || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function visibleTurns(turns: LiveMeetingTranscriptTurn[]) {
  return turns.filter((turn) => Boolean(turn.text?.trim()))
}

export function LiveRecordingDetail() {
  const navigate = useNavigate()
  const { copy, language } = useI18n()
  const {
    phase,
    elapsedSeconds,
    recordingStartedAt,
    noteId,
    liveTranscript,
  } = useMeetingRecorderStore()
  const lastTurnRef = useRef<HTMLDivElement | null>(null)
  const turns = useMemo(() => visibleTurns(liveTranscript.speakerTurns), [liveTranscript.speakerTurns])
  const isLive = phase === 'recording' || phase === 'paused'
  const title = createMeetingRecordingTitle(
    recordingStartedAt ? new Date(recordingStartedAt) : new Date(),
    language,
  )
  const fallbackText = liveTranscript.connection === 'failed'
    ? copy.meetingRecorder.liveUnavailable
    : liveTranscript.mode === 'buffered_final' || liveTranscript.liveSpeakerTurns === false
      ? copy.meetingRecorder.transcriptAfterStop
      : copy.meetingRecorder.liveListening

  useEffect(() => {
    if (noteId) {
      navigate(`/note/${noteId}?view=transcript`, { replace: true })
    }
  }, [navigate, noteId])

  useEffect(() => {
    if (isLive && turns.length > 0) {
      lastTurnRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isLive, turns])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fcfbf7] text-gray-900 dark:bg-[#181818] dark:text-gray-100">
      <header className="flex min-h-[92px] shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-[#f4f2ec] px-6 dark:border-gray-700 dark:bg-[#202020]">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/notes')}
            aria-label={copy.common.back}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{title}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 dark:bg-[#171717]">
                <span className={`h-2 w-2 rounded-full ${isLive ? 'animate-pulse bg-red-500' : 'bg-gray-400'}`} />
                {copy.meetingRecorder[phase]}
              </span>
              <span className="font-mono tabular-nums">{formatElapsed(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
        <div className="inline-flex h-10 shrink-0 items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-[#171717]">
          <span className="inline-flex h-8 items-center gap-2 rounded-md bg-primary-light px-3 text-sm font-medium text-white dark:bg-primary-dark">
            <MessageSquare className="h-4 w-4" />
            Transcript
          </span>
        </div>
      </header>

      <section className="stealth-scroll min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Live transcript metadata">
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200">
              <span className="text-gray-400">Status</span>
              <span className="font-medium">{liveTranscript.connection}</span>
            </span>
            {liveTranscript.mode ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200">
                <span className="text-gray-400">Mode</span>
                <span className="font-medium">{liveTranscript.mode}</span>
              </span>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111111]">
            {isLive && turns.length > 0 ? turns.map((turn, index) => (
              <div
                key={turn.turnId || `${turn.startMs ?? index}-${index}`}
                ref={index === turns.length - 1 ? lastTurnRef : undefined}
                className="grid grid-cols-[64px_120px_minmax(0,1fr)] items-start gap-3 border-b border-gray-100 px-4 py-4 text-left last:border-b-0 dark:border-gray-800"
              >
                <span className="text-sm font-medium tabular-nums text-gray-500">{formatTimestamp(turn.startMs)}</span>
                <span className="w-fit max-w-full truncate rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {turn.speakerId || 'Live'}
                </span>
                <p className="min-w-0 text-sm leading-6 text-gray-800 dark:text-gray-100">{turn.text}</p>
              </div>
            )) : isLive && liveTranscript.asrText.trim() ? (
              <div className="grid grid-cols-[64px_120px_minmax(0,1fr)] items-start gap-3 px-4 py-4">
                <span className="text-sm font-medium tabular-nums text-gray-500">{formatElapsed(elapsedSeconds).slice(3)}</span>
                <span className="w-fit rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">Live</span>
                <p className="min-w-0 text-sm leading-6 text-gray-800 dark:text-gray-100">{liveTranscript.asrText}</p>
              </div>
            ) : (
              <div className="flex min-h-32 items-center justify-center px-6 py-10 text-sm text-gray-500 dark:text-gray-400">
                {isLive ? fallbackText : copy.meetingRecorder[phase]}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
