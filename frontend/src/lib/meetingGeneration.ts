import type { WorkspaceSelection } from '../stores/teamStore'
import {
  submitUploadedSource,
  submitMeetingSessionRecording,
  waitForTaskCompletion,
  type SummaryMode,
  type TaskResponse,
  type TaskStatusResponse,
  type UploadGenerationInput,
} from './noteGenerationClient'

interface SubmitMeetingRecordingInput {
  audioBlob: Blob
  startedAt: Date
  outputLanguage?: string
  titleLocale?: string
  summaryMode: SummaryMode
  workspace: WorkspaceSelection
  meetingSessionId?: string
}

interface SubmitMeetingRecordingDependencies {
  submitUploadedSource?: (input: UploadGenerationInput) => Promise<TaskResponse>
  submitMeetingSessionRecording?: (sessionId: string, input: UploadGenerationInput) => Promise<TaskResponse>
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
  const payload: UploadGenerationInput = {
    file,
    sourceType: 'audio',
    title: createMeetingRecordingTitle(input.startedAt, input.titleLocale || 'zh-CN'),
    style: 'meeting',
    summaryMode: input.summaryMode,
    outputLanguage: input.outputLanguage || 'auto',
    workspace: input.workspace,
  }
  if (input.meetingSessionId) {
    const submitSession = dependencies.submitMeetingSessionRecording || submitMeetingSessionRecording
    return submitSession(input.meetingSessionId, payload)
  }
  const submit = dependencies.submitUploadedSource || submitUploadedSource
  return submit(payload)
}

export async function completeMeetingRecordingGeneration({
  taskId,
  fetchTaskStatus,
  onProgress,
  delay,
}: {
  taskId: string
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
  if (!status.note_id) {
    throw new Error('Meeting summary completed without a saved note.')
  }
  return { id: status.note_id }
}

function resolveAudioExtension(mimeType: string) {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('mp4')) return 'm4a'
  if (normalized.includes('mpeg')) return 'mp3'
  if (normalized.includes('ogg')) return 'ogg'
  if (normalized.includes('wav')) return 'wav'
  return 'webm'
}
