import { describe, expect, it, vi } from 'vitest'
import {
  buildMeetingRecordingFile,
  completeMeetingRecordingGeneration,
  createMeetingRecordingTitle,
  submitMeetingRecording,
} from './meetingGeneration'

describe('meetingGeneration', () => {
  it('creates a stable meeting recording file from a browser audio blob', () => {
    const file = buildMeetingRecordingFile(
      new Blob(['audio'], { type: 'audio/webm;codecs=opus' }),
      new Date('2026-06-15T10:20:30.000Z'),
    )

    expect(file.name).toBe('meeting-recording-2026-06-15-10-20-30.webm')
    expect(file.type).toBe('audio/webm;codecs=opus')
  })

  it('builds a readable localized meeting title', () => {
    expect(createMeetingRecordingTitle(new Date('2026-06-15T10:20:30+08:00'), 'zh-CN')).toContain('会议录音')
    expect(createMeetingRecordingTitle(new Date('2026-06-15T10:20:30Z'), 'en')).toContain('Meeting recording')
  })

  it('submits meeting recordings through the existing upload generation flow', async () => {
    const submitUploadedSource = vi.fn().mockResolvedValue({ task_id: 'task-1' })

    const response = await submitMeetingRecording(
      {
        audioBlob: new Blob(['audio'], { type: 'audio/webm' }),
        startedAt: new Date('2026-06-15T10:20:30.000Z'),
        outputLanguage: 'zh-CN',
        summaryMode: 'accurate',
        workspace: { scope: 'personal' },
      },
      { submitUploadedSource },
    )

    expect(response.task_id).toBe('task-1')
    expect(submitUploadedSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'audio',
      style: 'meeting',
      outputLanguage: 'zh-CN',
      summaryMode: 'accurate',
      workspace: { scope: 'personal' },
    }))
    expect(submitUploadedSource.mock.calls[0][0].file.name).toBe('meeting-recording-2026-06-15-10-20-30.webm')
  })

  it('uses the idempotent meeting-session completion route when live setup produced a local session', async () => {
    const submitUploadedSource = vi.fn()
    const submitMeetingSessionRecording = vi.fn().mockResolvedValue({ task_id: 'task-1' })

    await submitMeetingRecording({
      audioBlob: new Blob(['audio'], { type: 'audio/webm' }),
      startedAt: new Date('2026-06-15T10:20:30.000Z'),
      summaryMode: 'default',
      workspace: { scope: 'personal' },
      meetingSessionId: 'meeting-session-1',
    }, { submitUploadedSource, submitMeetingSessionRecording })

    expect(submitMeetingSessionRecording).toHaveBeenCalledWith(
      'meeting-session-1',
      expect.objectContaining({ sourceType: 'audio', outputLanguage: 'auto' }),
    )
    expect(submitUploadedSource).not.toHaveBeenCalled()
  })

  it('polls until backend finalization returns one saved note and reports progress', async () => {
    const fetchTaskStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: 'transcribing', message: 'Transcribing' })
      .mockResolvedValueOnce({ status: 'summarizing', message: 'Summarizing' })
      .mockResolvedValueOnce({
        status: 'success',
        message: 'Done',
        note_id: 'note-1',
        result: {
          task_id: 'task-1',
          title: 'Weekly Sync',
          markdown: '# Weekly Sync',
        },
      })
    const onProgress = vi.fn()

    const note = await completeMeetingRecordingGeneration({
      taskId: 'task-1',
      fetchTaskStatus,
      onProgress,
      delay: () => Promise.resolve(),
    })

    expect(note).toEqual({ id: 'note-1' })
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'transcribing' }))
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'summarizing' }))
  })

  it('surfaces failed generation status with a useful message', async () => {
    await expect(completeMeetingRecordingGeneration({
      taskId: 'task-1',
      fetchTaskStatus: vi.fn().mockResolvedValue({ status: 'failed', message: 'STT failed' }),
      delay: () => Promise.resolve(),
    })).rejects.toThrow('STT failed')
  })
})
