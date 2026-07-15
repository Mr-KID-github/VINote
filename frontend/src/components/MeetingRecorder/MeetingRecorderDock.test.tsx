import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MeetingRecorderDock } from './MeetingRecorderDock'
import { I18nProvider } from '../../lib/i18n'
import { useMeetingRecorderStore } from '../../stores/meetingRecorderStore'

const navigate = vi.fn()
const audioRecorderMock = vi.hoisted(() => ({
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
}))
const meetingGenerationMock = vi.hoisted(() => ({
  submitMeetingRecording: vi.fn(),
  completeMeetingRecordingGeneration: vi.fn(),
}))
const audioStorageMock = vi.hoisted(() => ({
  saveRecordedAudio: vi.fn(),
  loadRecordedAudio: vi.fn(),
  deleteRecordedAudio: vi.fn(),
  generateRecordingId: vi.fn(() => 'rec-1'),
}))
const realtimeMock = vi.hoisted(() => ({
  start: vi.fn(),
  sendFrame: vi.fn(),
  close: vi.fn(),
  markDegraded: vi.fn(),
  state: {
    connection: 'connecting',
    asrText: '',
    liveSpeakerTurns: null,
  } as Record<string, any>,
}))
const desktopRecorderWindowMock = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => false),
  isRecorderWindowRoute: vi.fn(() => false),
  openRecorderWindow: vi.fn(),
  setRecorderActive: vi.fn(),
  setRecorderWindowLayout: vi.fn(),
  showMainWindow: vi.fn(),
  closeCurrentRecorderWindow: vi.fn(),
  startCurrentRecorderWindowDrag: vi.fn(),
  emitRecorderWindowState: vi.fn(),
  emitRecorderOpenPanel: vi.fn(),
  listenRecorderWindowState: vi.fn(),
  listenDesktopNavigation: vi.fn(),
  listenRecorderOpenPanel: vi.fn(),
}))
let pcmFrameCallback: ((samples: Float32Array, sampleRate: number) => void) | undefined

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: (onPcmFrame?: (samples: Float32Array, sampleRate: number) => void) => {
    pcmFrameCallback = onPcmFrame
    return ({
    isSupported: true,
    elapsedSeconds: 0,
    error: '',
    start: audioRecorderMock.start,
    pause: audioRecorderMock.pause,
    resume: audioRecorderMock.resume,
    stop: audioRecorderMock.stop,
    reset: audioRecorderMock.reset,
    })
  },
}))

vi.mock('../../hooks/useMeetingRealtime', () => ({
  useMeetingRealtime: () => realtimeMock,
}))

vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ initialized: true, user: { id: 'user-1' } }),
}))

vi.mock('../../stores/languageStore', () => ({
  useLanguageStore: () => ({
    language: 'zh-CN',
    setLanguage: vi.fn(),
    syncWithAccount: vi.fn(),
  }),
}))

vi.mock('../../stores/teamStore', () => ({
  useTeamStore: () => ({
    currentWorkspace: { scope: 'personal' },
  }),
}))

vi.mock('../../stores/noteLibraryStore', () => ({
  useNoteLibraryStore: () => ({
    saveNote: vi.fn(),
  }),
}))

vi.mock('../../lib/meetingGeneration', () => ({
  submitMeetingRecording: meetingGenerationMock.submitMeetingRecording,
  completeMeetingRecordingGeneration: meetingGenerationMock.completeMeetingRecordingGeneration,
}))

vi.mock('../../lib/audioStorage', () => audioStorageMock)
vi.mock('../../lib/desktopRecorderWindow', () => desktopRecorderWindowMock)

function renderDock(props?: { autoStart?: boolean }) {
  return render(
    <I18nProvider>
      <MeetingRecorderDock {...props} />
    </I18nProvider>,
  )
}

describe('MeetingRecorderDock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMeetingRecorderStore.getState().resetSession()
    audioRecorderMock.start.mockResolvedValue(undefined)
    audioRecorderMock.stop.mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' }))
    meetingGenerationMock.submitMeetingRecording.mockResolvedValue({ task_id: 'task-1' })
    meetingGenerationMock.completeMeetingRecordingGeneration.mockResolvedValue({ id: 'note-1' })
    audioStorageMock.saveRecordedAudio.mockResolvedValue(undefined)
    audioStorageMock.loadRecordedAudio.mockResolvedValue(null)
    audioStorageMock.deleteRecordedAudio.mockResolvedValue(undefined)
    realtimeMock.start.mockResolvedValue('meeting-session-1')
    realtimeMock.sendFrame.mockReturnValue(true)
    realtimeMock.state = { connection: 'connecting', asrText: '', liveSpeakerTurns: null, speakerTurns: [] }
    desktopRecorderWindowMock.isTauriRuntime.mockReturnValue(false)
    desktopRecorderWindowMock.isRecorderWindowRoute.mockReturnValue(false)
    desktopRecorderWindowMock.openRecorderWindow.mockResolvedValue('created')
    desktopRecorderWindowMock.setRecorderActive.mockResolvedValue(undefined)
    desktopRecorderWindowMock.setRecorderWindowLayout.mockResolvedValue(undefined)
    desktopRecorderWindowMock.showMainWindow.mockResolvedValue(undefined)
    desktopRecorderWindowMock.closeCurrentRecorderWindow.mockResolvedValue(undefined)
    desktopRecorderWindowMock.startCurrentRecorderWindowDrag.mockResolvedValue(undefined)
    desktopRecorderWindowMock.emitRecorderWindowState.mockResolvedValue(undefined)
    desktopRecorderWindowMock.emitRecorderOpenPanel.mockResolvedValue(undefined)
    desktopRecorderWindowMock.listenRecorderWindowState.mockResolvedValue(undefined)
    desktopRecorderWindowMock.listenDesktopNavigation.mockResolvedValue(undefined)
    desktopRecorderWindowMock.listenRecorderOpenPanel.mockResolvedValue(undefined)
    pcmFrameCallback = undefined
  })

  it('opens the native recorder window without starting capture in the desktop main window', async () => {
    desktopRecorderWindowMock.isTauriRuntime.mockReturnValue(true)
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))

    expect(desktopRecorderWindowMock.openRecorderWindow).toHaveBeenCalledTimes(1)
    expect(desktopRecorderWindowMock.emitRecorderOpenPanel).toHaveBeenCalledTimes(1)
    expect(audioRecorderMock.start).not.toHaveBeenCalled()
  })

  it('auto-starts capture only inside the native recorder window', async () => {
    desktopRecorderWindowMock.isTauriRuntime.mockReturnValue(true)
    desktopRecorderWindowMock.isRecorderWindowRoute.mockReturnValue(true)
    renderDock({ autoStart: true })

    await waitFor(() => expect(audioRecorderMock.start).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('meeting-recorder-native-surface')).toBeInTheDocument()
    expect(screen.getByTestId('recorder-drag-handle')).toHaveAttribute('data-tauri-drag-region', 'true')
  })

  it('uses native drag and layout controls in the recorder window', async () => {
    desktopRecorderWindowMock.isTauriRuntime.mockReturnValue(true)
    desktopRecorderWindowMock.isRecorderWindowRoute.mockReturnValue(true)
    renderDock({ autoStart: true })

    const dragHandle = await screen.findByTestId('recorder-drag-handle')
    await userEvent.pointer({ target: dragHandle, keys: '[MouseLeft]' })
    expect(desktopRecorderWindowMock.startCurrentRecorderWindowDrag).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '最小化' }))
    expect(desktopRecorderWindowMock.setRecorderWindowLayout).toHaveBeenCalledWith('minimized')
    await userEvent.click(screen.getByRole('button', { name: '恢复会议录音悬浮窗' }))
    expect(desktopRecorderWindowMock.setRecorderWindowLayout).toHaveBeenCalledWith('expanded')
  })

  it('syncs native recorder snapshots into the desktop main store', async () => {
    desktopRecorderWindowMock.isTauriRuntime.mockReturnValue(true)
    let snapshotHandler: ((snapshot: any) => void) | undefined
    desktopRecorderWindowMock.listenRecorderWindowState.mockImplementation(async (handler) => {
      snapshotHandler = handler
      return undefined
    })
    renderDock()

    act(() => {
      snapshotHandler?.({
        isPanelOpen: true,
        isMinimized: false,
        phase: 'recording',
        elapsedSeconds: 12,
        recordingStartedAt: '2026-07-13T04:00:00.000Z',
        liveTranscript: {
          connection: 'ready',
          asrText: 'live words',
          speakerTurns: [],
          liveSpeakerTurns: true,
        },
        error: '',
        notification: null,
      })
    })

    await waitFor(() => expect(useMeetingRecorderStore.getState().phase).toBe('recording'))
    expect(useMeetingRecorderStore.getState().elapsedSeconds).toBe(12)
    expect(screen.queryByRole('region', { name: '会议录音' })).not.toBeInTheDocument()
  })

  it('starts recording directly from the compact pill and opens the floating recorder', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))

    expect(audioRecorderMock.start).toHaveBeenCalledTimes(1)
    expect(realtimeMock.start).toHaveBeenCalledTimes(1)
    expect(screen.getByText('会议录音')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '结束' })).toBeInTheDocument()
  })

  it('does not block durable recording while realtime session startup is pending', async () => {
    realtimeMock.start.mockReturnValue(new Promise(() => undefined))
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))

    await waitFor(() => expect(audioRecorderMock.start).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '结束' })).toBeInTheDocument()
  })

  it('derives sequenced realtime frames and pauses them without changing recorder control', async () => {
    renderDock()
    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))

    pcmFrameCallback?.(new Float32Array(960).fill(0.25), 48_000)
    expect(realtimeMock.sendFrame).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    pcmFrameCallback?.(new Float32Array(960).fill(0.25), 48_000)
    expect(realtimeMock.sendFrame).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: '继续' }))
    pcmFrameCallback?.(new Float32Array(960).fill(0.25), 48_000)
    expect(realtimeMock.sendFrame).toHaveBeenCalledTimes(2)
  })

  it('keeps buffered-final transcript messaging out of the floating recorder', async () => {
    realtimeMock.state = {
      connection: 'degraded',
      mode: 'buffered_final',
      asrText: '',
      liveSpeakerTurns: false,
      speakerTurns: [],
    }
    renderDock()
    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    expect(screen.queryByText('结束录音后显示转写。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开实时转写' })).toBeInTheDocument()
  })

  it('moves live speaker turns out of the floating recorder and opens the transcript detail', async () => {
    realtimeMock.state = {
      connection: 'ready',
      mode: 'native_streaming',
      asrText: 'live words',
      liveSpeakerTurns: true,
      speakerTurns: [{ turnId: 'turn-1', speakerId: 'speaker_01', text: 'live words' }],
    }
    renderDock()
    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    expect(screen.queryByText('speaker_01')).not.toBeInTheDocument()
    expect(screen.queryByText('live words')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '打开实时转写' }))
    expect(navigate).toHaveBeenCalledWith('/recording/live?view=transcript')
  })

  it('finishes a recording, submits it for generation, saves it, and shows the completion action', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))

    await waitFor(() => {
      expect(meetingGenerationMock.submitMeetingRecording).toHaveBeenCalledWith(expect.objectContaining({
        audioBlob: expect.any(Blob),
        outputLanguage: 'auto',
        titleLocale: 'zh-CN',
        summaryMode: 'default',
        workspace: { scope: 'personal' },
      }))
      expect(meetingGenerationMock.completeMeetingRecordingGeneration).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1',
      }))
    })
    expect(screen.getByRole('button', { name: '查看纪要' })).toBeInTheDocument()
  })

  it('does not rely on blocking browser confirm dialogs to finish', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))

    await waitFor(() => {
      expect(audioRecorderMock.stop).toHaveBeenCalledTimes(1)
    })
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('navigates to the generated meeting note from the completion notification', async () => {
    useMeetingRecorderStore.getState().complete('note-1')
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '查看纪要' }))

    expect(navigate).toHaveBeenCalledWith('/note/note-1')
  })

  it('explains server connection failures from the generation API', async () => {
    meetingGenerationMock.completeMeetingRecordingGeneration.mockRejectedValue(
      new Error('Error code: 401 - invalid_api_key'),
    )
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))

    expect(await screen.findAllByText('请先配置可用的 VILab Server 连接，再生成会议纪要。')).not.toHaveLength(0)
  })

  it('persists and submits the exact stopped blob, then removes it after success', async () => {
    const original = new Blob(['exact-original-audio'], { type: 'audio/webm' })
    audioRecorderMock.stop.mockResolvedValue(original)
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))

    await waitFor(() => expect(audioStorageMock.saveRecordedAudio).toHaveBeenCalled())
    expect(audioStorageMock.saveRecordedAudio.mock.calls[0][0]).toMatchObject({
      meetingSessionId: 'meeting-session-1',
    })
    expect(audioStorageMock.saveRecordedAudio.mock.calls[0][1]).toBe(original)
    expect(meetingGenerationMock.submitMeetingRecording.mock.calls[0][0].audioBlob).toBe(original)
    await waitFor(() => expect(audioStorageMock.deleteRecordedAudio).toHaveBeenCalledWith('rec-1'))
  })

  it('retries generation with the same preserved blob after failure', async () => {
    const original = new Blob(['retry-original-audio'], { type: 'audio/webm' })
    audioRecorderMock.stop.mockResolvedValue(original)
    meetingGenerationMock.completeMeetingRecordingGeneration
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ id: 'note-1' })
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))
    await screen.findByRole('button', { name: '重试' })
    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(meetingGenerationMock.submitMeetingRecording).toHaveBeenCalledTimes(2))
    expect(meetingGenerationMock.submitMeetingRecording.mock.calls[1][0].audioBlob).toBe(original)
    expect(audioRecorderMock.start).toHaveBeenCalledTimes(1)
  })

  it('restores a persisted recording after reload and retries the exact blob', async () => {
    const original = new Blob(['reload-original-audio'], { type: 'audio/webm' })
    audioStorageMock.loadRecordedAudio.mockResolvedValue({
      recovery: {
        id: 'rec-reloaded',
        startedAt: '2026-07-12T00:00:00.000Z',
        mimeType: 'audio/webm',
        meetingSessionId: 'meeting-session-reloaded',
      },
      blob: original,
    })
    renderDock()

    await screen.findByRole('button', { name: '重试' })
    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(meetingGenerationMock.submitMeetingRecording).toHaveBeenCalledTimes(1))
    expect(meetingGenerationMock.submitMeetingRecording.mock.calls[0][0]).toMatchObject({
      audioBlob: original,
      startedAt: new Date('2026-07-12T00:00:00.000Z'),
      meetingSessionId: 'meeting-session-reloaded',
    })
    expect(audioRecorderMock.start).not.toHaveBeenCalled()
    await waitFor(() => expect(audioStorageMock.deleteRecordedAudio).toHaveBeenCalledWith('rec-reloaded'))
  })

  it('does not persist or submit an empty recording', async () => {
    audioRecorderMock.stop.mockResolvedValue(new Blob([], { type: 'audio/webm' }))
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))

    await waitFor(() => expect(useMeetingRecorderStore.getState().phase).toBe('failed'))
    expect(audioStorageMock.saveRecordedAudio).not.toHaveBeenCalled()
    expect(meetingGenerationMock.submitMeetingRecording).not.toHaveBeenCalled()
  })
})
