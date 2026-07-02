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
const updateNoteMock = vi.hoisted(() => vi.fn())

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
  useNoteLibraryStore: () => ({ saveNote: saveNoteMock, updateNote: updateNoteMock }),
}))

vi.mock('../../stores/teamStore', () => ({
  useTeamStore: () => ({ currentWorkspace: { scope: 'personal' } }),
}))

vi.mock('../../stores/modelProfileStore', () => ({
  useModelProfileStore: () => ({ selectedProfileId: '', loadProfiles: vi.fn() }),
}))

vi.mock('../../stores/sttProfileStore', () => ({
  useSTTProfileStore: () => ({ selectedProfileId: '', loadProfiles: vi.fn() }),
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
  const originalOpen = window.open

  beforeEach(() => {
    window.open = originalOpen
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
    saveNoteMock.mockResolvedValue({ id: 'draft-1', title: '会议录音', content: '# Draft', taskId: 'task-1', status: 'pending' })
    updateNoteMock.mockResolvedValue({ id: 'draft-1', title: '会议录音', content: '# Summary', taskId: 'task-1', status: 'done' })
  })

  it('shows the smallest circular idle launcher and does not start recording until Start is clicked', async () => {
    renderDock()

    const idleLauncher = screen.getByRole('button', { name: '开始会议录音' })
    expect(screen.getByTestId('meeting-recorder-idle-dot').className).toContain('bg-[#FCA5A5]')
    expect(screen.getByTestId('meeting-recorder-idle-dot').className).not.toContain('bg-[#EF2B2D]')
    expect(idleLauncher.className).toContain('h-[52px]')
    expect(idleLauncher.className).toContain('w-[52px]')
    expect(idleLauncher.className).not.toContain('h-12')
    expect(idleLauncher.className).not.toContain('gap-3')

    await userEvent.click(idleLauncher)

    const panel = screen.getByRole('region', { name: '会议录音' })
    expect(audioRecorderMock.start).not.toHaveBeenCalled()
    expect(panel).toBeInTheDocument()
    expect(panel.className).toContain('w-[360px]')
    expect(panel).toHaveStyle({ right: '20px', bottom: '20px' })
    expect(screen.queryByLabelText('拖动会议录音浮窗')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument()
    expect(screen.getByText('准备就绪')).toBeInTheDocument()
    expect(screen.getByTestId('meeting-recorder-controls').className).toContain('mt-1')

    await userEvent.click(screen.getByRole('button', { name: '开始' }))
    expect(audioRecorderMock.start).toHaveBeenCalledTimes(1)
    expect(screen.getByText('录音中')).toBeInTheDocument()
    expect(screen.getByTestId('meeting-recorder-expanded-dot').className).toContain('bg-[#EF2B2D]')
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(screen.getByTestId('meeting-recorder-expanded-dot').className).toContain('bg-[#FCA5A5]')
    expect(screen.getByTestId('meeting-recorder-expanded-dot').className).not.toContain('bg-[#EF2B2D]')
  })

  it('requires pausing before the red Stop, then Stop directly generates the meeting note', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '开始' }))

    expect(screen.getByRole('button', { name: '停止' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(audioRecorderMock.pause).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: '停止' }))

    expect(audioRecorderMock.stop).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()

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

  it('protects recoverable recording data with an in-app discard confirmation from the cross close button', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '开始' }))
    act(() => {
      useMeetingRecorderStore.getState().setRecordedAudio(new Blob(['audio'], { type: 'audio/webm' }))
    })
    await userEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(screen.getByRole('dialog', { name: '放弃这段会议录音？' })).toBeInTheDocument()
    expect(screen.getByText(/会议录音很难重新获得/)).toBeInTheDocument()
  })

  it('uses the pill as the minimized view and dragging it does not restore the panel', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '最小化' }))

    const minimizedPill = screen.getByRole('button', { name: '恢复会议录音' })
    const minimizedShell = minimizedPill.parentElement
    expect(minimizedShell?.className).toContain('h-12')
    expect(minimizedShell?.className).toContain('gap-3')
    expect(screen.getByTestId('meeting-recorder-minimized-dot').className).toContain('bg-[#EF2B2D]')
    const dragHandle = screen.getByLabelText('拖动已最小化的会议录音')
    expect(dragHandle).toBeInTheDocument()

    await userEvent.pointer([
      { target: dragHandle, keys: '[MouseLeft>]', coords: { x: 900, y: 600 } },
      { target: dragHandle, coords: { x: 930, y: 620 } },
      { target: dragHandle, keys: '[/MouseLeft]', coords: { x: 930, y: 620 } },
    ])

    expect(screen.queryByRole('region', { name: '会议录音' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '恢复会议录音' })).toBeInTheDocument()
  })

  it('can detach the recorder into a separate always-on-top-capable window', async () => {
    const popupDocument = document.implementation.createHTMLDocument('recorder')
    const popupWindow = {
      document: popupDocument,
      closed: false,
      focus: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as Window
    const openSpy = vi.fn(() => popupWindow)
    window.open = openSpy as unknown as typeof window.open
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '弹出独立录音窗口' }))

    expect(openSpy).toHaveBeenCalledWith(
      '',
      'vinote-meeting-recorder',
      expect.stringContaining('width=390'),
    )
    expect(popupDocument.body.querySelector('#vinote-meeting-recorder-popout-root')).toBeTruthy()
    expect(popupWindow.focus).toHaveBeenCalled()
  })

  it('keeps recorded audio after generation failure and offers regenerate vs re-record choices', async () => {
    meetingGenerationMock.completeMeetingRecordingGeneration.mockRejectedValue(new Error('Error code: 401 - invalid_api_key'))
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    await userEvent.click(screen.getByRole('button', { name: '停止' }))

    const statusLine = await screen.findByTestId('meeting-recorder-status')
    expect(statusLine).toHaveTextContent('音频已保留')
    expect(statusLine).toHaveTextContent('请先配置可用的 LLM 和 STT API Key')
    expect(useMeetingRecorderStore.getState().recordedAudio).toBeInstanceOf(Blob)
    await waitFor(() => {
      expect(saveNoteMock).toHaveBeenCalledWith(
        expect.stringContaining('会议录音'),
        expect.stringContaining('原始音频'),
        undefined,
        'task-1',
        'meeting_recording',
        'pending',
      )
      expect(updateNoteMock).toHaveBeenCalledWith(
        'draft-1',
        expect.stringContaining('会议录音'),
        expect.stringContaining('错误原因'),
        'generation_failed',
      )
    })
    expect(screen.getByRole('button', { name: '重新生成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新录制' })).toBeInTheDocument()
  })

  it('creates a visible meeting recording draft after audio upload and completes that same note on success', async () => {
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    await userEvent.click(screen.getByRole('button', { name: '停止' }))

    await waitFor(() => {
      expect(saveNoteMock).toHaveBeenCalledWith(
        expect.stringContaining('会议录音'),
        expect.stringContaining('/api/task/task-1/artifacts/media/source_audio.webm'),
        undefined,
        'task-1',
        'meeting_recording',
        'pending',
      )
      expect(updateNoteMock).toHaveBeenCalledWith('draft-1', '会议录音 2026/07/01', '# Summary', 'done')
    })
    expect(screen.getByRole('button', { name: '查看纪要' })).toBeInTheDocument()
  })

  it('keeps generated content and shows save retry messaging in the status line instead of a reserved bottom card', async () => {
    renderDock()
    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    act(() => {
      useMeetingRecorderStore.getState().setGeneratedNote({ title: '会议录音', markdown: '# Summary', taskId: 'task-1' })
      useMeetingRecorderStore.getState().failStage('saving', '保存失败')
    })

    const statusLine = screen.getByTestId('meeting-recorder-status')
    expect(statusLine).toHaveTextContent('保存失败')
    expect(statusLine).toHaveTextContent('重新生成将复用已生成的纪要内容重新保存')
    expect(screen.queryByText('处理会议录音')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '重新生成' }))

    await waitFor(() => {
      expect(saveNoteMock).toHaveBeenCalledWith('会议录音', '# Summary', undefined, 'task-1', { scope: 'personal' }, 'meeting_recording')
    })
  })

  it('retries transcription or summary from the existing task when upload already succeeded', async () => {
    renderDock()
    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    act(() => {
      useMeetingRecorderStore.getState().setTaskId('task-1')
      useMeetingRecorderStore.getState().failStage('summarizing', '总结失败')
    })

    await userEvent.click(screen.getByRole('button', { name: '重新生成' }))

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

  it('explains model configuration failures from the generation API in the status line', async () => {
    meetingGenerationMock.completeMeetingRecordingGeneration.mockRejectedValue(
      new Error('Error code: 401 - invalid_api_key'),
    )
    renderDock()

    await userEvent.click(screen.getByRole('button', { name: '开始会议录音' }))
    await userEvent.click(screen.getByRole('button', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    await userEvent.click(screen.getByRole('button', { name: '停止' }))

    const statusLine = await screen.findByTestId('meeting-recorder-status')
    expect(statusLine).toHaveTextContent('请先配置可用的 LLM 和 STT API Key，再生成会议纪要。')
  })
})
