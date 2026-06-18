import type { NoteRecord } from '../stores/noteLibraryStore'
import type { WorkspaceSelection } from '../stores/teamStore'
import {
  submitUploadedSource,
  waitForTaskCompletion,
  type SummaryMode,
  type TaskResponse,
  type TaskStatusResponse,
  type UploadGenerationInput,
} from './noteGenerationClient'

export const MEETING_NOTE_SOURCE_TYPE = 'meeting_recording'

type SaveNote = (
  title: string,
  content: string,
  videoUrl?: string,
  taskId?: string,
  workspace?: WorkspaceSelection,
  sourceType?: string,
) => Promise<NoteRecord | null>

interface SubmitMeetingRecordingInput {
  audioBlob: Blob
  startedAt: Date
  outputLanguage?: string
  summaryMode: SummaryMode
  modelProfileId?: string
  sttProfileId?: string
}

interface SubmitMeetingRecordingDependencies {
  submitUploadedSource?: (input: UploadGenerationInput) => Promise<TaskResponse>
}

export function createMeetingRecordingTitle(date = new Date(), locale = 'zh-CN') {
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const prefix = locale.startsWith('zh') ? '会议录音' : 'Meeting recording'
  return `${prefix} ${formatter.format(date)}`
}

export function buildMeetingRecordingFile(audioBlob: Blob, startedAt = new Date()) {
  const extension = resolveAudioExtension(audioBlob.type)
  const timestamp = startedAt.toISOString().replace(/\.\d{3}Z$/, '').replace(/[T:]/g, '-')
  return new File([audioBlob], `meeting-recording-${timestamp}.${extension}`, {
    type: audioBlob.type || 'audio/webm',
  })
}

export async function submitMeetingRecording(
  input: SubmitMeetingRecordingInput,
  dependencies: SubmitMeetingRecordingDependencies = {},
) {
  const file = buildMeetingRecordingFile(input.audioBlob, input.startedAt)
  const submit = dependencies.submitUploadedSource || submitUploadedSource

  return submit({
    file,
    sourceType: 'audio',
    title: createMeetingRecordingTitle(input.startedAt, input.outputLanguage || 'zh-CN'),
    style: 'meeting',
    summaryMode: input.summaryMode,
    outputLanguage: input.outputLanguage,
    modelProfileId: input.modelProfileId,
    sttProfileId: input.sttProfileId,
  })
}

export async function completeMeetingRecordingGeneration({
  taskId,
  workspace,
  saveNote,
  fetchTaskStatus,
  onProgress,
  delay,
}: {
  taskId: string
  workspace: WorkspaceSelection
  saveNote: SaveNote
  fetchTaskStatus?: (taskId: string) => Promise<TaskStatusResponse>
  onProgress?: (status: TaskStatusResponse) => void
  delay?: () => Promise<void>
}) {
  const status = await waitForTaskCompletion({
    taskId,
    fetchStatus: fetchTaskStatus,
    onProgress,
    delay,
  })
  const result = status.result

  if (!result) {
    throw new Error('Meeting summary completed without a result.')
  }

  const note = await saveNote(
    result.title || createMeetingRecordingTitle(),
    result.markdown || '',
    undefined,
    result.task_id || taskId,
    workspace,
    MEETING_NOTE_SOURCE_TYPE,
  )

  if (!note) {
    throw new Error('Meeting summary was generated but could not be saved.')
  }

  return note
}

function resolveAudioExtension(mimeType: string) {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('mp4')) return 'm4a'
  if (normalized.includes('mpeg')) return 'mp3'
  if (normalized.includes('ogg')) return 'ogg'
  if (normalized.includes('wav')) return 'wav'
  return 'webm'
}
