import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VILabServerSettingsPanel } from './VILabServerSettingsPanel'

const storeMock = vi.hoisted(() => ({
  state: {
    connection: null as any,
    models: [] as any[],
    readiness: null as any,
    testResult: null as any,
    loading: false,
    testing: false,
    saving: false,
    error: '',
    loadConnection: vi.fn(),
    saveConnection: vi.fn(),
    testConnection: vi.fn(),
    loadModels: vi.fn(),
    clearError: vi.fn(),
  },
}))

vi.mock('../../stores/vilabServerStore', () => ({
  useVILabServerStore: () => storeMock.state,
  describeMissingModels: (readiness: { missing?: string[] } | null | undefined) => readiness?.missing?.join(', ') || 'required models',
}))

describe('VILabServerSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMock.state = {
      connection: null,
      models: [],
      readiness: null,
      testResult: null,
      loading: false,
      testing: false,
      saving: false,
      error: '',
      loadConnection: vi.fn(),
      saveConnection: vi.fn().mockResolvedValue({ status: 'untested' }),
      testConnection: vi.fn().mockResolvedValue(undefined),
      loadModels: vi.fn(),
      clearError: vi.fn(),
    }
  })

  it('renders disconnected empty state', () => {
    render(<VILabServerSettingsPanel />)

    expect(screen.getByText('VILab Server')).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.getByText('Connect to load available models')).toBeInTheDocument()
  })

  it('successful connect shows ready speech, diarization, and language models', () => {
    storeMock.state.connection = { status: 'connected', mode: 'local', base_url: 'http://127.0.0.1:9876', api_key_hint: '••••' }
    storeMock.state.models = [
      { id: 'asr-1', modelType: 'asr', provider: 'qwen', runtimeStatus: 'ready', streaming: true, requiresKey: false },
      { id: 'diarization-1', modelType: 'diarization', provider: 'sherpa', runtimeStatus: 'active', streaming: false, requiresKey: false },
      { id: 'llm-1', modelType: 'llm', provider: 'openai', runtimeStatus: 'ready', streaming: false, requiresKey: true },
    ]
    storeMock.state.readiness = {
      audioMeeting: { ready: true, missing: [], selectedModels: { asr: 'asr-1', diarization: 'diarization-1', llm: 'llm-1' } },
      transcriptNote: { ready: true, missing: [], selectedModels: { llm: 'llm-1' } },
    }

    render(<VILabServerSettingsPanel />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Speech models')).toBeInTheDocument()
    expect(screen.getByText('Diarization models')).toBeInTheDocument()
    expect(screen.getByText('Language models')).toBeInTheDocument()
    expect(screen.getByText('asr-1')).toBeInTheDocument()
    expect(screen.getByText('llm-1')).toBeInTheDocument()
    expect(screen.getByText('Audio meeting pipeline: Ready')).toBeInTheDocument()
    expect(screen.getByText('Transcript note pipeline: Ready')).toBeInTheDocument()
  })

  it('shows connected but not ready when diarization is missing', () => {
    storeMock.state.connection = { status: 'connected', mode: 'local', base_url: 'http://127.0.0.1:9876', api_key_hint: '••••' }
    storeMock.state.models = [
      { id: 'asr-1', modelType: 'asr', runtimeStatus: 'active' },
      { id: 'llm-1', modelType: 'llm', runtimeStatus: 'available' },
    ]
    storeMock.state.readiness = {
      audioMeeting: { ready: false, missing: ['diarization'], selectedModels: { asr: 'asr-1', llm: 'llm-1' } },
      transcriptNote: { ready: true, missing: [], selectedModels: { llm: 'llm-1' } },
    }

    render(<VILabServerSettingsPanel />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Audio meeting pipeline: Not ready')).toBeInTheDocument()
    expect(screen.getByText('Missing ready models: diarization.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Admin' })).toHaveAttribute('href', 'http://127.0.0.1:9876/admin/')
  })

  it('failed connect shows inline error and does not show models', () => {
    storeMock.state.error = 'Unauthorized VILab Server API key'

    render(<VILabServerSettingsPanel />)

    expect(screen.getByText('Unauthorized VILab Server API key')).toBeInTheDocument()
    expect(screen.queryByText('Speech models')).not.toBeInTheDocument()
  })

  it('refresh reloads models', async () => {
    const user = userEvent.setup()
    storeMock.state.connection = { status: 'connected', mode: 'remote', base_url: 'https://server', api_key_hint: 'sk••••abcd' }

    render(<VILabServerSettingsPanel />)
    await user.click(screen.getByRole('button', { name: /refresh/i }))

    await waitFor(() => expect(storeMock.state.loadModels).toHaveBeenCalled())
  })

  it('draft test success does not present the saved connection as connected', async () => {
    const user = userEvent.setup()

    render(<VILabServerSettingsPanel />)
    await user.click(screen.getByRole('button', { name: /test connection/i }))

    await waitFor(() => expect(storeMock.state.testConnection).toHaveBeenCalledWith({
      mode: 'local',
      base_url: 'http://127.0.0.1:9876',
      api_key: undefined,
    }))
    expect(screen.getByText('Connection test succeeded.')).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
  })

  it('save verifies the persisted connection rather than retesting the draft', async () => {
    const user = userEvent.setup()

    render(<VILabServerSettingsPanel />)
    await user.click(screen.getByRole('button', { name: /^connect$/i }))

    await waitFor(() => expect(storeMock.state.saveConnection).toHaveBeenCalled())
    expect(storeMock.state.testConnection).toHaveBeenCalledWith()
    expect(storeMock.state.loadConnection).toHaveBeenCalledTimes(2)
  })
})
