import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
const saveNoteMock = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

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

vi.mock('../../stores/noteLibraryStore', () => ({
  useNoteLibraryStore: () => ({ saveNote: saveNoteMock }),
}))

vi.mock('../../lib/meetingGeneration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/meetingGeneration')>()
  return {
    ...actual,
    submitMeetingRecording: meetingGenerationMock.submitMeetingRecording,
    completeMeetingRecordingGeneration: meetingGenerationMock.completeMeetingRecordingGeneration,
  }
})

function renderDock() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <MeetingRecorderDock />
      </I18nProvider>
    </MemoryRouter>,
  )
}

describe('MeetingRecorderDock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMeetingRecorderStore.getState().resetSession()
    audioRecorderMock.start.mockResolvedValue(undefined)
    audioRecorderMock.stop.mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' }))
    meetingGenerationMock.submitMeetingRecording.mockResolvedValue({ task_id: 'task-1' })
    meetingGenerationMock.completeMeetingRecordingGeneration.mockResolvedValue({
      id: 'note-1',
      title: '会议录音 2026/07/01',
      content: '# Summary',
    })
    saveNoteMock.mockResolvedValue({ id: 'note-1', title: '会议录音', content: '# Summary' })
  })

  it('starts recording directly from the compact pill and opens the floating recorder matching the reference hierarchy', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))

    expect(audioRecorderMock.start).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('region', { name: '会议录音' })).toBeInTheDocument()
    expect(screen.getByText('00:00:00')).toBeInTheDocument()
    expect(screen.getByLabelText('录音波形')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '结束' })).toBeInTheDocument()
  })

  it('protects recoverable recording data with an in-app discard confirmation instead of silent close', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    act(() => {
      useMeetingRecorderStore.getState().setRecordedAudio(new Blob(['audio'], { type: 'audio/webm' }))
    })
    await userEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(screen.getByRole('dialog', { name: '放弃这段会议录音？' })).toBeInTheDocument()
    expect(screen.getByText(/会议录音很难重新获得/)).toBeInTheDocument()
  })

  it('finishes a recording, reports processing stages, saves through the existing note flow, and shows open-note action', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '结束' }))

    await waitFor(() => {
      expect(meetingGenerationMock.submitMeetingRecording).toHaveBeenCalledWith(expect.objectContaining({
        audioBlob: expect.any(Blob),
        outputLanguage: 'zh-CN',
        summaryMode: 'default',
      }), expect.objectContaining({ onStage: expect.any(Function) }))
      expect(meetingGenerationMock.completeMeetingRecordingGeneration).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1',
        saveNote: expect.any(Function),
        onStage: expect.any(Function),
      }))
    })
    expect(screen.getByRole('button', { name: '查看纪要' })).toBeInTheDocument()
  })

  it('keeps generated content and makes save retry explicit after save failure', async () => {
    renderDock()
    act(() => {
      useMeetingRecorderStore.getState().setGeneratedNote({ title: '会议录音', markdown: '# Summary', taskId: 'task-1' })
      useMeetingRecorderStore.getState().failStage('saving', '保存失败')
    })

    expect(screen.getByText(/重试将复用已生成的纪要内容重新保存/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => {
      expect(saveNoteMock).toHaveBeenCalledWith('会议录音', '# Summary', undefined, 'task-1', 'meeting_recording')
    })
  })

  it('retries transcription or summary from the existing task when upload already succeeded', async () => {
    renderDock()
    act(() => {
      useMeetingRecorderStore.getState().setTaskId('task-1')
      useMeetingRecorderStore.getState().failStage('summarizing', '总结失败')
    })

    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => {
      expect(meetingGenerationMock.submitMeetingRecording).not.toHaveBeenCalled()
      expect(meetingGenerationMock.completeMeetingRecordingGeneration).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1',
        saveNote: expect.any(Function),
      }))
    })
  })

  it('navigates to the generated meeting note from the completion notification', async () => {
    act(() => {
      useMeetingRecorderStore.getState().complete('note-1')
    })
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

    expect(await screen.findByText('请先配置可用的 LLM 和 STT API Key，再生成会议纪要。')).toBeInTheDocument()
  })
})
