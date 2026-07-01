import { create } from 'zustand'

export type MeetingRecorderStage =
  | 'uploading'
  | 'transcribing'
  | 'summarizing'
  | 'saving'

export type MeetingRecorderPhase =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | MeetingRecorderStage
  | 'completed'
  | 'failed'

export interface MeetingRecorderNotification {
  kind: 'success' | 'error'
  title: string
  message?: string
  noteId?: string
}

export interface GeneratedMeetingNote {
  title: string
  markdown: string
  taskId: string
}

interface MeetingRecorderState {
  isPanelOpen: boolean
  isMinimized: boolean
  confirmDiscardOpen: boolean
  phase: MeetingRecorderPhase
  elapsedSeconds: number
  taskId?: string
  noteId?: string
  recordedAudio?: Blob
  generatedNote?: GeneratedMeetingNote
  failedStage?: MeetingRecorderStage
  error: string
  retryDescription: string
  hasRecoverableRecording: boolean
  notification: MeetingRecorderNotification | null
  openPanel: () => void
  closePanel: () => void
  requestClose: () => void
  cancelCloseRequest: () => void
  discardSession: () => void
  minimizePanel: () => void
  restorePanel: () => void
  setPhase: (phase: MeetingRecorderPhase) => void
  setElapsedSeconds: (elapsedSeconds: number) => void
  setTaskId: (taskId: string) => void
  setRecordedAudio: (audio: Blob | undefined) => void
  setGeneratedNote: (note: GeneratedMeetingNote) => void
  failStage: (stage: MeetingRecorderStage, error: string) => void
  complete: (noteId: string) => void
  fail: (error: string) => void
  dismissNotification: () => void
  resetSession: () => void
}

const retryDescriptions: Record<MeetingRecorderStage, string> = {
  uploading: '重试将复用这段录音重新上传。',
  transcribing: '重试将复用这段录音重新转写。',
  summarizing: '重试将复用已保留的录音或转写结果继续生成纪要。',
  saving: '重试将复用已生成的纪要内容重新保存。',
}

const initialState = {
  isPanelOpen: false,
  isMinimized: false,
  confirmDiscardOpen: false,
  phase: 'idle' as MeetingRecorderPhase,
  elapsedSeconds: 0,
  taskId: undefined as string | undefined,
  noteId: undefined as string | undefined,
  recordedAudio: undefined as Blob | undefined,
  generatedNote: undefined as GeneratedMeetingNote | undefined,
  failedStage: undefined as MeetingRecorderStage | undefined,
  error: '',
  retryDescription: '',
  hasRecoverableRecording: false,
  notification: null as MeetingRecorderNotification | null,
}

function hasRecoveryRisk(state: Pick<MeetingRecorderState, 'phase' | 'recordedAudio' | 'generatedNote' | 'noteId'>) {
  if (state.noteId) return false
  if (state.recordedAudio || state.generatedNote) return true
  return ['recording', 'paused', 'stopping', 'uploading', 'transcribing', 'summarizing', 'saving'].includes(state.phase)
}

export const useMeetingRecorderStore = create<MeetingRecorderState>((set, get) => ({
  ...initialState,
  openPanel: () => set({ isPanelOpen: true, isMinimized: false }),
  closePanel: () => set({ isPanelOpen: false, isMinimized: false, confirmDiscardOpen: false }),
  requestClose: () => set((state) => {
    if (hasRecoveryRisk(state)) {
      return { confirmDiscardOpen: true, isPanelOpen: true }
    }
    return { isPanelOpen: false, isMinimized: false, confirmDiscardOpen: false }
  }),
  cancelCloseRequest: () => set({ confirmDiscardOpen: false }),
  discardSession: () => set(initialState),
  minimizePanel: () => set({ isPanelOpen: true, isMinimized: true, confirmDiscardOpen: false }),
  restorePanel: () => set({ isPanelOpen: true, isMinimized: false }),
  setPhase: (phase) => set((state) => ({
    phase,
    error: '',
    failedStage: undefined,
    retryDescription: '',
    hasRecoverableRecording: hasRecoveryRisk({ ...state, phase }),
  })),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setTaskId: (taskId) => set({ taskId }),
  setRecordedAudio: (recordedAudio) => set((state) => ({
    recordedAudio,
    hasRecoverableRecording: hasRecoveryRisk({ ...state, recordedAudio }),
  })),
  setGeneratedNote: (generatedNote) => set((state) => ({
    generatedNote,
    hasRecoverableRecording: hasRecoveryRisk({ ...state, generatedNote }),
  })),
  failStage: (failedStage, error) => set((state) => ({
    phase: 'failed',
    failedStage,
    error,
    retryDescription: retryDescriptions[failedStage],
    isPanelOpen: true,
    isMinimized: false,
    hasRecoverableRecording: hasRecoveryRisk({ ...state, phase: 'failed' }),
    notification: {
      kind: 'error',
      title: '会议总结失败',
      message: `${retryDescriptions[failedStage]}${error ? ` ${error}` : ''}`,
    },
  })),
  complete: (noteId) => set({
    phase: 'completed',
    noteId,
    recordedAudio: undefined,
    generatedNote: undefined,
    failedStage: undefined,
    error: '',
    retryDescription: '',
    hasRecoverableRecording: false,
    isPanelOpen: true,
    isMinimized: false,
    notification: { kind: 'success', title: '会议已总结好', noteId },
  }),
  fail: (error) => get().failStage('summarizing', error),
  dismissNotification: () => set({ notification: null }),
  resetSession: () => set(initialState),
}))
