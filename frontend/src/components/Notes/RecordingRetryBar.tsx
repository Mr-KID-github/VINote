import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { getRecordedAudio } from '../../lib/audioStorage'
import {
  MeetingGenerationError,
  completeMeetingRecordingGeneration,
  fetchMeetingAudioBlob,
  submitMeetingRecording,
} from '../../lib/meetingGeneration'
import { useNoteLibraryStore, type NoteRecord } from '../../stores/noteLibraryStore'
import { useTeamStore } from '../../stores/teamStore'

interface RecordingRetryBarProps {
  note: NoteRecord
  onUpdated: (note: NoteRecord) => void
}

const RECORDING_ID_RE = /<!--\s*recording_id:\s*([^\s]+)\s*-->/

function extractRecordingId(content: string): string | null {
  const match = content.match(RECORDING_ID_RE)
  return match ? match[1] : null
}

export function RecordingRetryBar({ note, onUpdated }: RecordingRetryBarProps) {
  const { copy, language } = useI18n()
  const { updateNote, loadNoteById } = useNoteLibraryStore()
  const { currentWorkspace } = useTeamStore()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const recordingId = extractRecordingId(note.content || '')

  useEffect(() => {
    setStatus('idle')
    setMessage('')
  }, [note.id])

  if (note.sourceType !== 'meeting_recording') return null
  if (note.status === 'done') return null

  const isFailed = note.status === 'transcribing_failed' || note.status === 'generation_failed'

  const runRetry = async () => {
    if (status === 'working') return
    setStatus('working')
    setMessage('')
    try {
      let audio: Blob | null = null
      if (recordingId) {
        audio = await getRecordedAudio(recordingId)
      }
      if (!audio && note.taskId) {
        audio = await fetchMeetingAudioBlob(note.taskId)
      }
      if (!audio) {
        throw new Error(copy.meetingRecorder.noRecoverableAudio)
      }
      setMessage(copy.meetingRecorder.phases.uploading)
      const response = await submitMeetingRecording({
        audioBlob: audio,
        startedAt: new Date(note.createdAt),
        outputLanguage: language,
        summaryMode: 'default',
      })
      setMessage(copy.meetingRecorder.phases.transcribing)
      const saved = await completeMeetingRecordingGeneration({
        taskId: response.task_id,
        workspace: currentWorkspace,
        saveNote: async (title, content) => {
          const updated = await updateNote(note.id, title, content, 'done')
          return updated
        },
      })
      onUpdated({ ...note, id: saved.id, status: 'done', content: saved.content, title: saved.title, taskId: response.task_id })
      setStatus('idle')
      setMessage('')
      await loadNoteById(note.id)
    } catch (retryError) {
      const errorMessage = retryError instanceof MeetingGenerationError
        ? retryError.message
        : retryError instanceof Error
          ? retryError.message
          : copy.meetingRecorder.unknownError
      setStatus('error')
      setMessage(errorMessage)
    }
  }

  // Only the failed variant renders as a compact icon. Pending recordings
  // surface their state through the editor itself; no extra chrome needed.
  if (!isFailed) return null

  const isWorking = status === 'working'

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void runRetry()}
        disabled={isWorking}
        title={copy.meetingRecorder.retry}
        aria-label={copy.meetingRecorder.retry}
        data-testid="recording-retry-icon"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-[#1b1b1b] dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/40"
      >
        {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
      </button>
      {status === 'error' ? (
        <span
          title={message}
          aria-label={message}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          <AlertCircle className="h-4 w-4" />
        </span>
      ) : null}
    </span>
  )
}