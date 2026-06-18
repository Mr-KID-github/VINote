import { render, screen, waitFor } from '@testing-library/react'
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

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isSupported: true,
    elapsedSeconds: 0,
    error: '',
    start: audioRecorderMock.start,
    pause: audioRecorderMock.pause,
    resume: audioRecorderMock.resume,
    stop: audioRecorderMock.stop,
    reset: audioRecorderMock.reset,
  }),
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

vi.mock('../../stores/modelProfileStore', () => ({
  useModelProfileStore: () => ({
    selectedProfileId: '',
    loadProfiles: vi.fn(),
  }),
}))

vi.mock('../../stores/sttProfileStore', () => ({
  useSTTProfileStore: () => ({
    selectedProfileId: '',
    loadProfiles: vi.fn(),
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

function renderDock() {
  return render(
    <I18nProvider>
      <MeetingRecorderDock />
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
  })

  it('starts recording directly from the compact pill and opens the floating recorder', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))

    expect(audioRecorderMock.start).toHaveBeenCalledTimes(1)
    expect(screen.getByText('会议录音')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '结束' })).toBeInTheDocument()
  })

  it('finishes a recording, submits it for generation, saves it, and shows the completion action', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))

    await waitFor(() => {
      expect(meetingGenerationMock.submitMeetingRecording).toHaveBeenCalledWith(expect.objectContaining({
        audioBlob: expect.any(Blob),
        outputLanguage: 'zh-CN',
        summaryMode: 'default',
      }))
      expect(meetingGenerationMock.completeMeetingRecordingGeneration).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1',
        workspace: { scope: 'personal' },
        saveNote: expect.any(Function),
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

  it('explains model configuration failures from the generation API', async () => {
    meetingGenerationMock.completeMeetingRecordingGeneration.mockRejectedValue(
      new Error('Error code: 401 - invalid_api_key'),
    )
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))

    expect(await screen.findAllByText('请先配置可用的 LLM 和 STT API Key，再生成会议纪要。')).not.toHaveLength(0)
  })
})
