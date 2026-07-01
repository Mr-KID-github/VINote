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

export type MeetingGenerationStage = 'uploading' | 'transcribing' | 'summarizing' | 'saving' | 'completed'

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
      modelProfileId: input.modelProfileId,
      sttProfileId: input.sttProfileId,
    })
  } catch (error) {
    throw new MeetingGenerationError('uploading', error instanceof Error ? error.message : 'Upload failed')
  }
}

export async function waitForMeetingTaskCompletion({
  taskId,
  fetchTaskStatus,
  onStage,
  delay,
}: {
  taskId: string
  fetchTaskStatus?: (taskId: string) => Promise<TaskStatusResponse>
  onStage?: (stage: MeetingGenerationStage) => void
  delay?: () => Promise<void>
}) {
  let lastRunningStage: 'transcribing' | 'summarizing' = 'transcribing'
  try {
    return await waitForTaskCompletion({
      taskId,
      fetchStatus: fetchTaskStatus,
      onProgress: (status) => {
        if (status.status === 'transcribing') {
          lastRunningStage = 'transcribing'
          onStage?.('transcribing')
        } else if (status.status === 'summarizing' || status.status === 'screenshots') {
          lastRunningStage = 'summarizing'
          onStage?.('summarizing')
        }
      },
      delay,
    })
  } catch (error) {
    if (error instanceof MeetingGenerationError) {
      throw error
    }
    throw new MeetingGenerationError(
      lastRunningStage,
      error instanceof Error ? error.message : 'Meeting generation failed',
    )
  }
}

export async function completeMeetingRecordingGeneration({
  taskId,
  workspace,
  saveNote,
  fetchTaskStatus,
  onStage,
  delay,
}: {
  taskId: string
  workspace: WorkspaceSelection
  saveNote: SaveNote
  fetchTaskStatus?: (taskId: string) => Promise<TaskStatusResponse>
  onStage?: (stage: MeetingGenerationStage) => void
  delay?: () => Promise<void>
}) {
  const status = await waitForMeetingTaskCompletion({ taskId, fetchTaskStatus, onStage, delay })
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
    workspace,
    MEETING_NOTE_SOURCE_TYPE,
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
