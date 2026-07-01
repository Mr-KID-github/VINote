import { beforeEach, describe, expect, it } from 'vitest'
import { useMeetingRecorderStore } from './meetingRecorderStore'

describe('meetingRecorderStore', () => {
  beforeEach(() => {
    useMeetingRecorderStore.getState().resetSession()
  })

  it('keeps recoverable audio and requires confirmation before closing an active recording', () => {
    const store = useMeetingRecorderStore.getState()
    const blob = new Blob(['audio'], { type: 'audio/webm' })

    store.openPanel()
    store.setPhase('recording')
    store.setRecordedAudio(blob)
    store.requestClose()

    const state = useMeetingRecorderStore.getState()
    expect(state.isPanelOpen).toBe(true)
    expect(state.confirmDiscardOpen).toBe(true)
    expect(state.recordedAudio).toBe(blob)
    expect(state.hasRecoverableRecording).toBe(true)
  })

  it('tracks explicit processing stages and failed stage for user-visible retry', () => {
    const store = useMeetingRecorderStore.getState()

    store.setPhase('uploading')
    store.setPhase('transcribing')
    store.failStage('transcribing', 'STT failed')

    const state = useMeetingRecorderStore.getState()
    expect(state.phase).toBe('failed')
    expect(state.failedStage).toBe('transcribing')
    expect(state.retryDescription).toContain('转写')
    expect(state.error).toBe('STT failed')
  })

  it('retains generated content on save failure so retry does not re-upload or re-summarize', () => {
    const store = useMeetingRecorderStore.getState()
    const generated = { title: '会议录音 2026-07-01 11:30', markdown: '# Summary', taskId: 'task-1' }

    store.setGeneratedNote(generated)
    store.failStage('saving', 'save failed')

    const state = useMeetingRecorderStore.getState()
    expect(state.failedStage).toBe('saving')
    expect(state.generatedNote).toEqual(generated)
    expect(state.retryDescription).toContain('保存')
  })

  it('completion clears recovery risk and exposes a success notification that opens the note', () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' })
    const store = useMeetingRecorderStore.getState()

    store.setRecordedAudio(blob)
    store.complete('note-1')

    const state = useMeetingRecorderStore.getState()
    expect(state.phase).toBe('completed')
    expect(state.noteId).toBe('note-1')
    expect(state.hasRecoverableRecording).toBe(false)
    expect(state.recordedAudio).toBeUndefined()
    expect(state.notification).toMatchObject({ kind: 'success', noteId: 'note-1' })
  })
})
