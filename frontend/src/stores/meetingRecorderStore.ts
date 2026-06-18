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

interface MeetingRecorderState {
  isPanelOpen: boolean
  isMinimized: boolean
  phase: MeetingRecorderPhase
  elapsedSeconds: number
  taskId?: string
  noteId?: string
  error: string
  notification: MeetingRecorderNotification | null
  openPanel: () => void
  closePanel: () => void
  minimizePanel: () => void
  restorePanel: () => void
  setPhase: (phase: MeetingRecorderPhase) => void
  setElapsedSeconds: (elapsedSeconds: number) => void
  setTaskId: (taskId: string) => void
  complete: (noteId: string) => void
  fail: (error: string) => void
  dismissNotification: () => void
  resetSession: () => void
}

const initialState = {
  isPanelOpen: false,
  isMinimized: false,
  phase: 'idle' as MeetingRecorderPhase,
  elapsedSeconds: 0,
  taskId: undefined as string | undefined,
  noteId: undefined as string | undefined,
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
  setTaskId: (taskId) => set({ taskId }),
  complete: (noteId) => set({
    phase: 'completed',
    noteId,
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
  resetSession: () => set(initialState),
}))
