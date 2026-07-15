import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiJson } from './api'
import {
  progressForGenerationStep,
  submitMeetingSessionRecording,
  submitUploadedSource,
  taskGenerationStep,
} from './noteGenerationClient'

vi.mock('./api', () => ({ apiJson: vi.fn() }))

describe('noteGenerationClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits team workspace ownership with audio uploads', async () => {
    vi.mocked(apiJson).mockResolvedValue({ task_id: 'task-1' })

    await submitUploadedSource({
      file: new File(['audio'], 'meeting.wav', { type: 'audio/wav' }),
      sourceType: 'audio',
      title: 'Meeting',
      summaryMode: 'default',
      workspace: { scope: 'team', teamId: 'team-1' },
    })

    const options = vi.mocked(apiJson).mock.calls[0][1]
    const body = options?.body as FormData
    expect(body.get('scope')).toBe('team')
    expect(body.get('team_id')).toBe('team-1')
    expect(body.get('source_type')).toBe('audio')
    expect(body.get('output_language')).toBe('auto')
  })

  it('submits the original recording to the encoded idempotent meeting completion route', async () => {
    vi.mocked(apiJson).mockResolvedValue({ task_id: 'task-1' })
    const file = new File(['exact-original'], 'meeting.webm', { type: 'audio/webm' })

    await submitMeetingSessionRecording('meeting session/1', {
      file,
      sourceType: 'audio',
      title: 'Meeting',
      summaryMode: 'default',
      workspace: { scope: 'personal' },
    })

    expect(vi.mocked(apiJson).mock.calls[0][0]).toBe('/api/meeting/sessions/meeting%20session%2F1/complete')
    const body = vi.mocked(apiJson).mock.calls[0][1]?.body as FormData
    expect(body.get('file')).toBe(file)
    expect(body.get('scope')).toBe('personal')
    expect(body.get('output_language')).toBe('auto')
  })

  it('uses the reported backend stage when a failed task reached summary generation', () => {
    const task = {
      status: 'failed',
      message: 'Child summary failed',
      metadata: {
        progress: { stage: 'summary' },
        error: { stage: 'summary' },
      },
    }

    const step = taskGenerationStep(task)
    expect(step).toBe('summarizing')
    expect(progressForGenerationStep(step!)).toBe(80)
  })

  it('does not mislabel speaker transcript failures as summary failures', () => {
    expect(taskGenerationStep({
      status: 'failed',
      message: 'Child speaker transcript failed',
      metadata: { error: { stage: 'speaker_transcript' } },
    })).toBe('transcribing')
  })
})
