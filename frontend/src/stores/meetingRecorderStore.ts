import { create } from 'zustand'

export type MeetingRecorderPhase =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'uploading'
  | 'transcribing'
  | 'summarizing'
  | 'completed'
  | 'failed'

export interface MeetingRecorderNotification {
  kind: 'success' | 'error'
  title: string
  message?: string
  noteId?: string
}

export interface LiveMeetingTranscriptTurn {
  turnId?: string
  speakerId?: string
  startMs?: number
  endMs?: number
  text?: string
}

export interface LiveMeetingTranscript {
  connection: 'idle' | 'connecting' | 'ready' | 'degraded' | 'closed' | 'failed'
  mode?: string
  asrText: string
  speakerTurns: LiveMeetingTranscriptTurn[]
  liveSpeakerTurns: boolean | null
  error?: string
}

export interface MeetingRecorderExternalSnapshot {
  isPanelOpen: boolean
  isMinimized: boolean
  phase: MeetingRecorderPhase
  elapsedSeconds: number
  taskId?: string
  noteId?: string
  recordingStartedAt?: string
  liveTranscript: LiveMeetingTranscript
  error: string
  notification: MeetingRecorderNotification | null
}

interface MeetingRecorderState {
  isPanelOpen: boolean
  isMinimized: boolean
  phase: MeetingRecorderPhase
  elapsedSeconds: number
  taskId?: string
  noteId?: string
  recordingId?: string
  recordedAudio?: Blob
  recordingStartedAt?: string
  meetingSessionId?: string
  error: string
  notification: MeetingRecorderNotification | null
  liveTranscript: LiveMeetingTranscript
  openPanel: () => void
  closePanel: () => void
  minimizePanel: () => void
  restorePanel: () => void
  setPhase: (phase: MeetingRecorderPhase) => void
  setElapsedSeconds: (elapsedSeconds: number) => void
  setRecordingStartedAt: (recordingStartedAt: string) => void
  setTaskId: (taskId: string) => void
  setRecordedAudio: (recordingId: string, recordedAudio: Blob, recordingStartedAt: string, meetingSessionId?: string) => void
  setMeetingSessionId: (meetingSessionId: string) => void
  setLiveTranscript: (liveTranscript: LiveMeetingTranscript) => void
  complete: (noteId: string) => void
  fail: (error: string) => void
  dismissNotification: () => void
  syncExternalState: (snapshot: MeetingRecorderExternalSnapshot) => void
  resetSession: () => void
}

const initialState = {
  isPanelOpen: false,
  isMinimized: false,
  phase: 'idle' as MeetingRecorderPhase,
  elapsedSeconds: 0,
  taskId: undefined as string | undefined,
  noteId: undefined as string | undefined,
  recordingId: undefined as string | undefined,
  recordedAudio: undefined as Blob | undefined,
  recordingStartedAt: undefined as string | undefined,
  meetingSessionId: undefined as string | undefined,
  liveTranscript: {
    connection: 'idle',
    asrText: '',
    speakerTurns: [],
    liveSpeakerTurns: null,
  } as LiveMeetingTranscript,
  error: '',
  notification: null as MeetingRecorderNotification | null,
}

export const useMeetingRecorderStore = create<MeetingRecorderState>((set) => ({
  ...initialState,
  openPanel: () => set({ isPanelOpen: true, isMinimized: false }),
  closePanel: () => set({ isPanelOpen: false, isMinimized: false }),
  minimizePanel: () => set({ isPanelOpen: true, isMinimized: true }),
  restorePanel: () => set({ isPanelOpen: true, isMinimized: false }),
  setPhase: (phase) => set({ phase, error: '' }),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setRecordingStartedAt: (recordingStartedAt) => set({ recordingStartedAt }),
  setTaskId: (taskId) => set({ taskId }),
  setRecordedAudio: (recordingId, recordedAudio, recordingStartedAt, meetingSessionId) => set({
    recordingId,
    recordedAudio,
    recordingStartedAt,
    meetingSessionId,
  }),
  setMeetingSessionId: (meetingSessionId) => set({ meetingSessionId }),
  setLiveTranscript: (liveTranscript) => set({ liveTranscript }),
  complete: (noteId) => set({
    phase: 'completed',
    noteId,
    recordingId: undefined,
    recordedAudio: undefined,
    recordingStartedAt: undefined,
    meetingSessionId: undefined,
    liveTranscript: initialState.liveTranscript,
    isPanelOpen: true,
    isMinimized: false,
    error: '',
    notification: {
      kind: 'success',
      title: '会议已总结好',
      noteId,
    },
  }),
  fail: (error) => set({
    phase: 'failed',
    error,
    isPanelOpen: true,
    isMinimized: false,
    notification: {
      kind: 'error',
      title: '会议总结失败',
      message: error,
    },
  }),
  dismissNotification: () => set({ notification: null }),
  syncExternalState: (snapshot) => set(snapshot),
  resetSession: () => set(initialState),
}))
