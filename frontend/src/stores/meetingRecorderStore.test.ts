import { beforeEach, describe, expect, it } from 'vitest'
import { useMeetingRecorderStore } from './meetingRecorderStore'

describe('meetingRecorderStore', () => {
  beforeEach(() => {
    useMeetingRecorderStore.getState().resetSession()
  })

  it('opens, minimizes, and restores the floating recorder', () => {
    const store = useMeetingRecorderStore.getState()

    store.openPanel()
    expect(useMeetingRecorderStore.getState().isPanelOpen).toBe(true)
    expect(useMeetingRecorderStore.getState().isMinimized).toBe(false)

    useMeetingRecorderStore.getState().minimizePanel()
    expect(useMeetingRecorderStore.getState().isPanelOpen).toBe(true)
    expect(useMeetingRecorderStore.getState().isMinimized).toBe(true)

    useMeetingRecorderStore.getState().restorePanel()
    expect(useMeetingRecorderStore.getState().isMinimized).toBe(false)
  })

  it('records completion metadata and exposes a success notification', () => {
    useMeetingRecorderStore.getState().setTaskId('task-1')
    useMeetingRecorderStore.getState().setMeetingSessionId('meeting-session-1')
    useMeetingRecorderStore.getState().complete('note-1')

    const state = useMeetingRecorderStore.getState()
    expect(state.phase).toBe('completed')
    expect(state.taskId).toBe('task-1')
    expect(state.noteId).toBe('note-1')
    expect(state.meetingSessionId).toBeUndefined()
    expect(state.notification).toMatchObject({
      kind: 'success',
      title: '会议已总结好',
      noteId: 'note-1',
    })
  })

  it('keeps failure details and allows retry by resetting transient state', () => {
    useMeetingRecorderStore.getState().setPhase('summarizing')
    useMeetingRecorderStore.getState().fail('network failed')

    expect(useMeetingRecorderStore.getState().phase).toBe('failed')
    expect(useMeetingRecorderStore.getState().error).toBe('network failed')
    expect(useMeetingRecorderStore.getState().notification?.kind).toBe('error')

    useMeetingRecorderStore.getState().resetSession()

    const state = useMeetingRecorderStore.getState()
    expect(state.phase).toBe('idle')
    expect(state.error).toBe('')
    expect(state.taskId).toBeUndefined()
    expect(state.notification).toBeNull()
  })

  it('accepts recorder-window snapshots without copying media blobs', () => {
    useMeetingRecorderStore.getState().syncExternalState({
      isPanelOpen: true,
      isMinimized: false,
      phase: 'recording',
      elapsedSeconds: 18,
      taskId: 'task-native',
      recordingStartedAt: '2026-07-13T04:00:00.000Z',
      liveTranscript: {
        connection: 'ready',
        mode: 'native_streaming',
        asrText: 'live words',
        speakerTurns: [{ turnId: 'turn-1', speakerId: 'speaker_01', text: 'live words' }],
        liveSpeakerTurns: true,
      },
      error: '',
      notification: null,
    })

    const state = useMeetingRecorderStore.getState()
    expect(state.phase).toBe('recording')
    expect(state.elapsedSeconds).toBe(18)
    expect(state.taskId).toBe('task-native')
    expect(state.liveTranscript.speakerTurns[0].text).toBe('live words')
    expect(state.recordedAudio).toBeUndefined()
  })
})
