import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '../lib/i18n'
import { NoteEditor } from './NoteEditor'

const noteStoreMock = vi.hoisted(() => ({
  loadNoteById: vi.fn(),
  updateNote: vi.fn(),
  createShareLink: vi.fn(),
  getShareLink: vi.fn(),
  disableShareLink: vi.fn(),
}))

const apiMock = vi.hoisted(() => ({
  apiJson: vi.fn(),
  apiUrl: vi.fn((path: string) => `http://api.test${path}`),
}))

vi.mock('../lib/api', () => ({ apiJson: apiMock.apiJson, apiUrl: apiMock.apiUrl }))
vi.mock('../stores/languageStore', () => ({
  useLanguageStore: () => ({ language: 'en', setLanguage: vi.fn(), syncWithAccount: vi.fn() }),
}))
vi.mock('../stores/noteLibraryStore', () => ({ useNoteLibraryStore: () => noteStoreMock }))

const pipelineTrace = {
  stageRunIds: { speakerTranscript: 'speaker-run', summary: 'summary-run', note: 'note-run' },
  transcript: {
    rawText: 'We agree to active Sort former.',
    rawTurns: [
      {
        speakerId: 'speaker_01',
        startMs: 62000,
        endMs: 72000,
        text: 'We agree to active Sort former.',
      },
    ],
    finalText: 'We agreed to activate Sortformer.',
    cleanedTurns: [
      {
        speakerId: 'speaker_01',
        startMs: 62000,
        endMs: 72000,
        text: 'We agreed to activate Sortformer.',
      },
    ],
    turns: [
      {
        speakerId: 'speaker_01',
        startMs: 62000,
        endMs: 72000,
        text: 'We agreed to activate Sortformer.',
      },
    ],
    postprocess: { requestedMode: 'postprocessed', status: 'completed' },
    alignment: { method: 'diarize_then_asr_chunks' },
    resolvedModels: {
      asr: 'sensevoice-small',
      diarization: 'nvidia-sortformer-4spk-v2.1',
    },
    speakerCount: 2,
  },
  summary: { engine: 'deterministic', fallbackUsed: true, errorCategory: 'timeout' },
}

function renderEditor(initialEntry = '/note/note-1?view=minutes') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/note/:id" element={<I18nProvider><NoteEditor /></I18nProvider>} />
        <Route path="/notes" element={<div>Notes</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('NoteEditor Summary and Transcript views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    apiMock.apiJson.mockImplementation((path: string, options?: RequestInit) => {
      if (path.endsWith('/speakers') && options?.method === 'PATCH') {
        return Promise.resolve({ aliases: { speaker_01: 'Susan Wang' } })
      }
      return Promise.resolve(pipelineTrace)
    })
    noteStoreMock.loadNoteById.mockResolvedValue({
      id: 'note-1',
      title: 'Meeting note',
      content: '# Meeting minutes\n\nMinutes only.',
      sourceType: 'meeting_recording',
      taskId: 'task-1',
      status: 'done',
      scope: 'personal',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
    })
    noteStoreMock.getShareLink.mockResolvedValue(null)
  })

  it('keeps one shared audio player and transcript evidence out of Summary', async () => {
    renderEditor()

    expect(await screen.findByDisplayValue(/Minutes only/)).toBeInTheDocument()
    expect(screen.getAllByTestId('source-audio')).toHaveLength(1)
    expect(screen.getByTestId('source-audio')).toHaveAttribute(
      'src',
      'http://api.test/api/notes/note-1/media',
    )
    expect(screen.queryByText('speaker_01')).not.toBeInTheDocument()
    expect(screen.queryByText('nvidia-sortformer-4spk-v2.1')).not.toBeInTheDocument()
    expect(apiMock.apiJson).toHaveBeenCalledWith('/api/notes/note-1/pipeline')
  })

  it('uses a stable view switcher while Summary controls reserve their toolbar space', async () => {
    renderEditor()
    const switcher = await screen.findByTestId('note-view-switcher')

    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }))

    expect(screen.getByTestId('note-view-switcher')).toBe(switcher)
    expect(screen.getByText('Edit').closest('div')).toHaveClass('invisible')
    expect(screen.queryByDisplayValue(/Minutes only/)).not.toBeInTheDocument()
  })

  it('renders model evidence and seeks the shared audio from a transcript turn', async () => {
    renderEditor('/note/note-1?view=transcript')

    const turn = await screen.findByText('We agreed to activate Sortformer.')
    expect(screen.getByText('speaker_01')).toBeInTheDocument()
    expect(screen.getByText('nvidia-sortformer-4spk-v2.1')).toBeInTheDocument()
    expect(screen.getByText('diarize_then_asr_chunks')).toBeInTheDocument()

    fireEvent.click(turn)

    const audio = screen.getByTestId('source-audio') as HTMLAudioElement
    expect(audio.currentTime).toBe(62)
    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1))
  })

  it('tracks the active transcript turn as the audio plays', async () => {
    renderEditor('/note/note-1?view=transcript')
    const turn = await screen.findByText('We agreed to activate Sortformer.')
    const audio = screen.getByTestId('source-audio') as HTMLAudioElement

    audio.currentTime = 63
    fireEvent.timeUpdate(audio)

    await waitFor(() => expect(turn.closest('button')).toHaveAttribute('aria-current', 'true'))
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('defaults to cleaned turns and toggles raw ASR without seeking audio', async () => {
    renderEditor('/note/note-1?view=transcript')
    expect(await screen.findByText('We agreed to activate Sortformer.')).toBeInTheDocument()
    const audio = screen.getByTestId('source-audio') as HTMLAudioElement
    audio.currentTime = 65

    fireEvent.click(screen.getByRole('button', { name: 'Show raw ASR' }))

    expect(await screen.findByText('We agree to active Sort former.')).toBeInTheDocument()
    expect(audio.currentTime).toBe(65)
    expect(screen.getByRole('button', { name: 'Show smart cleanup' })).toBeInTheDocument()
  })

  it('keeps the same audio control and playback position when switching views', async () => {
    renderEditor('/note/note-1?view=minutes')
    await screen.findByDisplayValue(/Minutes only/)
    const audio = screen.getByTestId('source-audio') as HTMLAudioElement
    audio.currentTime = 63
    fireEvent.timeUpdate(audio)

    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }))

    expect(screen.getByTestId('source-audio')).toBe(audio)
    expect((screen.getByTestId('source-audio') as HTMLAudioElement).currentTime).toBe(63)
    const turn = await screen.findByText('We agreed to activate Sortformer.')
    expect(turn.closest('button')).toHaveAttribute('aria-current', 'true')
  })

  it('saves a speaker alias without changing the transcript evidence', async () => {
    renderEditor('/note/note-1?view=transcript')
    await screen.findByText('speaker_01')

    fireEvent.click(screen.getByRole('button', { name: 'Rename speaker_01' }))
    fireEvent.change(screen.getByLabelText('Rename speaker_01'), { target: { value: 'Susan Wang' } })
    fireEvent.click(screen.getByTitle('Save speaker name'))

    expect(await screen.findByText('Susan Wang')).toBeInTheDocument()
    expect(screen.getByText('We agreed to activate Sortformer.')).toBeInTheDocument()
    expect(apiMock.apiJson).toHaveBeenCalledWith(
      '/api/notes/note-1/speakers',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ aliases: { speaker_01: 'Susan Wang' } }),
      }),
    )
  })

  it('exports the summary markdown from the Summary view', async () => {
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:summary') as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    try {
      renderEditor('/note/note-1?view=minutes')
      await screen.findByDisplayValue('Meeting note')

      fireEvent.click(screen.getByTitle('Export'))

      expect(clickSpy).toHaveBeenCalled()
      expect(clickSpy.mock.instances[0]?.download).toBe('Meeting note.md')
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      clickSpy.mockRestore()
    }
  })

  it('exports the transcript (with speaker labels and timestamp) from the Transcript view', async () => {
    let capturedPayload = ''
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const reader = new FileReader()
      reader.onload = () => {
        capturedPayload = typeof reader.result === 'string' ? reader.result : ''
      }
      reader.readAsText(blob)
      return 'blob:transcript'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    try {
      renderEditor('/note/note-1?view=transcript')
      await screen.findByText('We agreed to activate Sortformer.')

      fireEvent.click(screen.getByTitle('Export'))

      expect(clickSpy).toHaveBeenCalled()
      expect(clickSpy.mock.instances[0]?.download).toBe('Meeting note.transcript.md')

      await waitFor(() => expect(capturedPayload).toContain('We agreed to activate Sortformer.'))
      expect(capturedPayload).toContain('01:02')
      expect(capturedPayload).toContain('**speaker_01**')
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      clickSpy.mockRestore()
    }
  })
})
