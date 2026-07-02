import type { NoteRecord } from '../stores/noteLibraryStore'
import type { WorkspaceSelection } from '../stores/teamStore'
import { apiFetch, apiJson } from './api'

export const MEETING_NOTE_SOURCE_TYPE = 'meeting_recording'

export type SummaryMode = 'default' | 'accurate' | 'oneshot'
export type MeetingGenerationStage = 'uploading' | 'transcribing' | 'summarizing' | 'saving' | 'completed'

export type TaskResponse = { task_id: string }
export type TaskStatusResponse = {
  task_id?: string
  status: string
  message?: string
  result?: {
    task_id: string
    title: string
    markdown: string
  }
}

type SaveNote = (
  title: string,
  content: string,
  videoUrl?: string,
  taskId?: string,
  workspace?: WorkspaceSelection,
  sourceType?: string,
  status?: string,
) => Promise<NoteRecord | null>

interface UploadGenerationInput {
  file: File
  sourceType: 'audio'
  title: string
  style: 'meeting'
  summaryMode: SummaryMode
  outputLanguage?: string
}

interface SubmitMeetingRecordingInput {
  audioBlob: Blob
  startedAt: Date
  outputLanguage?: string
  summaryMode: SummaryMode
}

interface SubmitMeetingRecordingDependencies {
  submitUploadedSource?: (input: UploadGenerationInput) => Promise<TaskResponse>
  onStage?: (stage: MeetingGenerationStage) => void
}

export class MeetingGenerationError extends Error {
  stage: 'uploading' | 'transcribing' | 'summarizing' | 'saving'

  constructor(stage: MeetingGenerationError['stage'], message: string) {
    super(message)
    this.name = 'MeetingGenerationError'
    this.stage = stage
  }
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

export async function submitUploadedSource(input: UploadGenerationInput) {
  const formData = new FormData()
  formData.append('file', input.file)
  formData.append('title', input.title)
  formData.append('style', input.style)
  formData.append('summary_mode', input.summaryMode)
  formData.append('source_type', input.sourceType)
  if (input.outputLanguage) {
    formData.append('output_language', input.outputLanguage)
  }

  const response = await apiFetch('/api/generate_from_upload', {
    method: 'POST',
    body: formData,
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.message || 'Upload failed')
  }
  return payload as TaskResponse
}

export async function submitMeetingRecording(
  input: SubmitMeetingRecordingInput,
  dependencies: SubmitMeetingRecordingDependencies = {},
) {
  dependencies.onStage?.('uploading')
  const file = buildMeetingRecordingFile(input.audioBlob, input.startedAt)
  const submit = dependencies.submitUploadedSource || submitUploadedSource

  try {
    return await submit({
      file,
      sourceType: 'audio',
      title: createMeetingRecordingTitle(input.startedAt, input.outputLanguage || 'zh-CN'),
      style: 'meeting',
      summaryMode: input.summaryMode,
      outputLanguage: input.outputLanguage,
    })
  } catch (error) {
    throw new MeetingGenerationError('uploading', error instanceof Error ? error.message : 'Upload failed')
  }
}

async function defaultFetchTaskStatus(taskId: string) {
  return apiJson<TaskStatusResponse>(`/api/task/${taskId}`)
}

async function defaultDelay() {
  await new Promise((resolve) => window.setTimeout(resolve, 2000))
}

export async function waitForTaskCompletion({
  taskId,
  fetchTaskStatus = defaultFetchTaskStatus,
  onStage,
  delay = defaultDelay,
}: {
  taskId: string
  fetchTaskStatus?: (taskId: string) => Promise<TaskStatusResponse>
  onStage?: (stage: MeetingGenerationStage) => void
  delay?: () => Promise<void>
}) {
  let lastRunningStage: 'transcribing' | 'summarizing' = 'transcribing'
  for (;;) {
    const status = await fetchTaskStatus(taskId)
    if (status.status === 'transcribing') {
      lastRunningStage = 'transcribing'
      onStage?.('transcribing')
    } else if (status.status === 'summarizing' || status.status === 'screenshots') {
      lastRunningStage = 'summarizing'
      onStage?.('summarizing')
    } else if (status.status === 'success') {
      return status
    } else if (status.status === 'failed') {
      throw new MeetingGenerationError(lastRunningStage, status.message || 'Meeting generation failed')
    }
    await delay()
  }
}

export async function completeMeetingRecordingGeneration({
  taskId,
  saveNote,
  fetchTaskStatus,
  onStage,
  delay,
}: {
  taskId: string
  saveNote: SaveNote
  fetchTaskStatus?: (taskId: string) => Promise<TaskStatusResponse>
  onStage?: (stage: MeetingGenerationStage) => void
  delay?: () => Promise<void>
}) {
  const status = await waitForTaskCompletion({ taskId, fetchTaskStatus, onStage, delay })
  const result = status.result
  if (!result) {
    throw new MeetingGenerationError('summarizing', 'Meeting summary completed without a result.')
  }

  onStage?.('saving')
  const note = await saveNote(
    result.title || createMeetingRecordingTitle(),
    result.markdown || '',
    undefined,
    result.task_id || taskId,
    undefined,
    MEETING_NOTE_SOURCE_TYPE,
    'done',
  )
  if (!note) {
    throw new MeetingGenerationError('saving', 'Meeting summary was generated but could not be saved.')
  }
  onStage?.('completed')
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