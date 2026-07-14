import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { useNoteGenerationStore } from '../stores/noteGenerationStore'
import { NoteGenerator } from './NoteGenerator'

const apiMock = vi.hoisted(() => ({
  apiJson: vi.fn(),
}))
const navigateMock = vi.hoisted(() => vi.fn())
const vilabStoreMock = vi.hoisted(() => ({
  state: {
    connection: { status: 'connected', base_url: 'http://127.0.0.1:9876' } as any,
    readiness: {
      audioMeeting: { ready: true, missing: [], selectedModels: { asr: 'asr-1', diarization: 'dia-1', llm: 'llm-1' } },
      transcriptNote: { ready: true, missing: [], selectedModels: { llm: 'llm-1' } },
    } as any,
    loadConnection: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  apiJson: apiMock.apiJson,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../stores/languageStore', () => ({
  useLanguageStore: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    syncWithAccount: vi.fn(),
  }),
}))

vi.mock('../stores/noteLibraryStore', () => ({
  useNoteLibraryStore: () => ({
    saveNote: vi.fn(),
  }),
}))

vi.mock('../stores/teamStore', async () => {
  const actual = await vi.importActual<typeof import('../stores/teamStore')>('../stores/teamStore')
  return {
    ...actual,
    useTeamStore: () => ({
      currentWorkspace: { scope: 'personal' },
      teams: [],
      loadTeams: vi.fn(),
    }),
  }
})

vi.mock('../stores/vilabServerStore', () => ({
  useVILabServerStore: () => vilabStoreMock.state,
  describeMissingModels: (readiness: { missing?: string[] } | null | undefined) => readiness?.missing?.join(', ') || 'required models',
}))

function renderGenerator() {
  return render(
    <I18nProvider>
      <NoteGenerator />
    </I18nProvider>
  )
}

describe('NoteGenerator failed generation recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNoteGenerationStore.getState().reset()
    vilabStoreMock.state.connection = { status: 'connected', base_url: 'http://127.0.0.1:9876' }
    vilabStoreMock.state.readiness = {
      audioMeeting: { ready: true, missing: [], selectedModels: { asr: 'asr-1', diarization: 'dia-1', llm: 'llm-1' } },
      transcriptNote: { ready: true, missing: [], selectedModels: { llm: 'llm-1' } },
    }
  })

  it('keeps URL compatibility visible but disabled and submits audio only through upload generation', async () => {
    apiMock.apiJson.mockResolvedValueOnce({ task_id: 'audio-task' })
    renderGenerator()

    expect(screen.getByRole('button', { name: 'Video URL' })).toBeDisabled()
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput?.accept).toBe('audio/*')
    await userEvent.upload(fileInput!, new File(['audio'], 'meeting.wav', { type: 'audio/wav' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start generation' }))

    await waitFor(() => expect(apiMock.apiJson).toHaveBeenCalledWith('/api/generate_from_upload', expect.any(Object)))
    expect(apiMock.apiJson).not.toHaveBeenCalledWith('/api/generate', expect.anything())
    const formData = apiMock.apiJson.mock.calls[0][1].body as FormData
    expect(formData.get('source_type')).toBe('audio')
  })

  it('lets users regenerate directly with the same audio file after a generation request fails', async () => {
    apiMock.apiJson
      .mockRejectedValueOnce(new Error('backend unavailable'))
      .mockResolvedValueOnce({ task_id: 'retry-task' })

    renderGenerator()

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
    await userEvent.upload(fileInput!, new File(['audio'], 'meeting.wav', { type: 'audio/wav' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start generation' }))

    expect(await screen.findByText('backend unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Download audio')).not.toBeInTheDocument()
    expect(screen.queryByText('Process screenshots')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => expect(apiMock.apiJson).toHaveBeenCalledTimes(2))
    expect(apiMock.apiJson.mock.calls[1][0]).toBe('/api/generate_from_upload')
    const retryForm = apiMock.apiJson.mock.calls[1][1].body as FormData
    expect((retryForm.get('file') as File).name).toBe('meeting.wav')
  })

  it('renders server-backed generation state', () => {
    renderGenerator()

    expect(screen.getByText('Using ready VILab Server pipeline')).toBeInTheDocument()
  })

  it('blocks audio generation when diarization is not ready', () => {
    vilabStoreMock.state.readiness = {
      audioMeeting: { ready: false, missing: ['diarization'], selectedModels: { asr: 'asr-1', llm: 'llm-1' } },
      transcriptNote: { ready: true, missing: [], selectedModels: { llm: 'llm-1' } },
    }

    renderGenerator()

    expect(screen.getByText('VILab Server connected, pipeline not ready')).toBeInTheDocument()
    expect(screen.getByText(/Missing ready models: diarization/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start generation' })).toBeDisabled()
  })
})
