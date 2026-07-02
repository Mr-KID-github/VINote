import { describe, expect, it, vi } from 'vitest'
import {
  buildMeetingRecordingFile,
  completeMeetingRecordingGeneration,
  createMeetingRecordingTitle,
  submitMeetingRecording,
} from './meetingGeneration'

describe('meetingGeneration', () => {
  it('creates a stable meeting recording file from browser audio', () => {
    const file = buildMeetingRecordingFile(
      new Blob(['audio'], { type: 'audio/webm;codecs=opus' }),
      new Date('2026-07-01T03:30:00.000Z'),
    )

    expect(file.name).toBe('meeting-recording-2026-07-01-03-30-00.webm')
    expect(file.type).toBe('audio/webm;codecs=opus')
  })

  it('submits meeting recordings through an upload flow and reports upload stage', async () => {
    const onStage = vi.fn()
    const submitUploadedSource = vi.fn().mockResolvedValue({ task_id: 'task-1' })

    const response = await submitMeetingRecording(
      {
        audioBlob: new Blob(['audio'], { type: 'audio/webm' }),
        startedAt: new Date('2026-07-01T03:30:00.000Z'),
        outputLanguage: 'zh-CN',
        summaryMode: 'default',
      },
      { submitUploadedSource, onStage },
    )

    expect(response.task_id).toBe('task-1')
    expect(onStage).toHaveBeenCalledWith('uploading')
    expect(submitUploadedSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'audio',
      style: 'meeting',
      title: expect.stringContaining('会议录音'),
    }))
  })

  it('polls stages, saves through the existing note flow, and reports saving before completion', async () => {
    const fetchTaskStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: 'transcribing', message: 'Transcribing' })
      .mockResolvedValueOnce({ status: 'summarizing', message: 'Summarizing' })
      .mockResolvedValueOnce({
        status: 'success',
        message: 'Done',
        result: { task_id: 'task-1', title: 'Weekly Sync', markdown: '# Summary' },
      })
    const saveNote = vi.fn().mockResolvedValue({ id: 'note-1' })
    const onStage = vi.fn()

    const note = await completeMeetingRecordingGeneration({
      taskId: 'task-1',
      saveNote,
      fetchTaskStatus,
      onStage,
      delay: () => Promise.resolve(),
    })

    expect(note).toEqual({ id: 'note-1' })
    expect(onStage.mock.calls.map((call) => call[0])).toEqual([
      'transcribing',
      'summarizing',
      'saving',
      'completed',
    ])
    expect(saveNote).toHaveBeenCalledWith(
      'Weekly Sync',
      '# Summary',
      undefined,
      'task-1',
      undefined,
      'meeting_recording',
      'done',
    )
  })

  it('throws a stage-aware error when saving fails after generation succeeds', async () => {
    await expect(completeMeetingRecordingGeneration({
      taskId: 'task-1',
      fetchTaskStatus: vi.fn().mockResolvedValue({
        status: 'success',
        message: 'Done',
        result: { task_id: 'task-1', title: 'Weekly Sync', markdown: '# Summary' },
      }),
      saveNote: vi.fn().mockResolvedValue(null),
      delay: () => Promise.resolve(),
    })).rejects.toMatchObject({ stage: 'saving' })
  })

  it('builds a recognizable meeting recording title', () => {
    expect(createMeetingRecordingTitle(new Date('2026-07-01T03:30:00.000Z'), 'zh-CN')).toContain('会议录音')
    expect(createMeetingRecordingTitle(new Date('2026-07-01T03:30:00.000Z'), 'en')).toContain('Meeting recording')
  })
})
