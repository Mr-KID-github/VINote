import { apiJson } from './api'

export type SummaryMode = 'default' | 'accurate' | 'oneshot'
export type UploadSourceType = 'audio' | 'video' | 'transcript'

export interface TaskResponse {
  task_id: string
  status?: string
  message?: string
}

export interface TaskStatusResponse {
  task_id?: string
  status: string
  message: string
  note_id?: string
  result?: {
    task_id: string
    title: string
    markdown: string
  }
  metadata?: {
    progress?: { stage?: string }
    error?: { stage?: string }
  }
}

export type NoteGenerationStep = 'uploading' | 'transcribing' | 'summarizing'

export function taskGenerationStep(status: TaskStatusResponse): NoteGenerationStep | undefined {
  const stage = String(status.metadata?.error?.stage || status.metadata?.progress?.stage || '')
    .trim()
    .toLowerCase()

  if (stage.includes('summary') || stage.includes('note') || stage.includes('format')) {
    return 'summarizing'
  }
  if (stage.includes('speaker') || stage.includes('transcript') || stage.includes('diar') || stage.includes('asr')) {
    return 'transcribing'
  }
  if (stage.includes('source') || stage.includes('upload')) {
    return 'uploading'
  }
  if (status.status === 'summarizing' || status.status === 'screenshots') {
    return 'summarizing'
  }
  if (status.status === 'transcribing') {
    return 'transcribing'
  }
  return undefined
}

export function progressForGenerationStep(step: NoteGenerationStep): number {
  if (step === 'summarizing') return 80
  if (step === 'transcribing') return 50
  return 20
}

export interface UploadGenerationInput {
  file: File
  sourceType: UploadSourceType
  title: string
  style?: string
  summaryMode: SummaryMode
  outputLanguage?: string
  workspace?: { scope: 'personal' | 'team'; teamId?: string }
}

export async function submitUploadedSource(input: UploadGenerationInput) {
  return submitUpload('/api/generate_from_upload', input)
}

export async function submitMeetingSessionRecording(sessionId: string, input: UploadGenerationInput) {
  return submitUpload(`/api/meeting/sessions/${encodeURIComponent(sessionId)}/complete`, input)
}

async function submitUpload(endpoint: string, input: UploadGenerationInput) {
  const formData = new FormData()
  formData.append('file', input.file)
  formData.append('source_type', input.sourceType)
  formData.append('title', input.title)
  formData.append('style', input.style || 'meeting')
  formData.append('summary_mode', input.summaryMode)

  if (input.outputLanguage) {
    formData.append('output_language', input.outputLanguage)
  }
  formData.append('scope', input.workspace?.scope || 'personal')
  if (input.workspace?.scope === 'team' && input.workspace.teamId) {
    formData.append('team_id', input.workspace.teamId)
  }

  return apiJson<TaskResponse>(endpoint, {
    method: 'POST',
    body: formData,
  })
}

export async function fetchTaskStatus(taskId: string) {
  return apiJson<TaskStatusResponse>(`/api/task/${taskId}`)
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function waitForTaskCompletion({
  taskId,
  fetchStatus = fetchTaskStatus,
  onProgress,
  delay = () => wait(2000),
}: {
  taskId: string
  fetchStatus?: (taskId: string) => Promise<TaskStatusResponse>
  onProgress?: (status: TaskStatusResponse) => void
  delay?: () => Promise<void>
}) {
  while (true) {
    const status = await fetchStatus(taskId)
    onProgress?.(status)

    if (status.status === 'success') {
      return status
    }

    if (status.status === 'failed' || status.status === 'not_found') {
      throw new Error(status.message || 'Generation failed')
    }

    await delay()
  }
}
