import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VILabServerSettingsPanel } from './VILabServerSettingsPanel'

const storeMock = vi.hoisted(() => ({
  state: {
    connection: null as any,
    models: [] as any[],
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
}))

describe('VILabServerSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMock.state = {
      connection: null,
      models: [],
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

  it('successful connect shows grouped speech and language models', () => {
    storeMock.state.connection = { status: 'connected', mode: 'local', base_url: 'http://127.0.0.1:9876', api_key_hint: '••••' }
    storeMock.state.models = [
      { id: 'asr-1', modelType: 'asr', provider: 'qwen', runtimeStatus: 'ready', streaming: true, requiresKey: false },
      { id: 'llm-1', modelType: 'llm', provider: 'openai', runtimeStatus: 'ready', streaming: false, requiresKey: true },
    ]

    render(<VILabServerSettingsPanel />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Speech models')).toBeInTheDocument()
    expect(screen.getByText('Language models')).toBeInTheDocument()
    expect(screen.getByText('asr-1')).toBeInTheDocument()
    expect(screen.getByText('llm-1')).toBeInTheDocument()
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
})
