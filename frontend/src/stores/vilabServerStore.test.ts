import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiJson } from '../lib/api'
import { useVILabServerStore, type VILabServerConnection } from './vilabServerStore'

vi.mock('../lib/api', () => ({
  apiJson: vi.fn(),
}))

const apiJsonMock = vi.mocked(apiJson)

const savedConnection: VILabServerConnection = {
  mode: 'local',
  base_url: 'http://saved-server',
  api_key_hint: 'sk-s••••alue',
  status: 'untested',
}

describe('vilabServerStore connection testing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useVILabServerStore.setState({
      connection: savedConnection,
      models: [{ id: 'saved-model', modelType: 'asr' }],
      readiness: null,
      testResult: null,
      loading: false,
      testing: false,
      saving: false,
      error: '',
    })
  })

  it('keeps a successful draft test separate from the saved connection', async () => {
    apiJsonMock.mockResolvedValue({
      ok: true,
      status: 'connected',
      base_url: 'http://draft-server',
      version: '0.4.0',
      latency_ms: 12,
      models: [{ id: 'draft-model', modelType: 'llm' }],
      readiness: {
        audioMeeting: { ready: false, missing: ['asr', 'diarization'], selectedModels: { llm: 'draft-model' } },
        transcriptNote: { ready: true, missing: [], selectedModels: { llm: 'draft-model' } },
      },
    })

    await useVILabServerStore.getState().testConnection({
      mode: 'remote',
      base_url: 'http://draft-server',
    })

    const state = useVILabServerStore.getState()
    expect(state.connection).toEqual(savedConnection)
    expect(state.models).toEqual([{ id: 'saved-model', modelType: 'asr' }])
    expect(state.readiness).toBeNull()
    expect(state.testResult).toMatchObject({ status: 'connected', base_url: 'http://draft-server' })
    expect(apiJsonMock).toHaveBeenCalledWith(
      '/api/vilab-server/connection/test',
      expect.objectContaining({ body: JSON.stringify({ mode: 'remote', base_url: 'http://draft-server' }) }),
    )
  })

  it('updates saved state only for a no-body saved connection test', async () => {
    apiJsonMock.mockResolvedValue({
      ok: true,
      status: 'connected',
      base_url: 'http://saved-server',
      version: '0.4.0',
      latency_ms: 9,
      models: [{ id: 'active-model', modelType: 'asr' }],
      readiness: {
        audioMeeting: { ready: false, missing: ['diarization', 'llm'], selectedModels: { asr: 'active-model' } },
        transcriptNote: { ready: false, missing: ['llm'], selectedModels: {} },
      },
    })

    await useVILabServerStore.getState().testConnection()

    const state = useVILabServerStore.getState()
    expect(state.connection).toMatchObject({ status: 'connected', version: '0.4.0', latency_ms: 9 })
    expect(state.models).toEqual([{ id: 'active-model', modelType: 'asr' }])
    expect(state.readiness?.audioMeeting.missing).toEqual(['diarization', 'llm'])
    expect(state.testResult).toBeNull()
    expect(apiJsonMock).toHaveBeenCalledWith('/api/vilab-server/connection/test', { method: 'POST' })
  })

  it('does not mark the saved connection failed when a draft test fails', async () => {
    apiJsonMock.mockRejectedValue(new Error('connection refused'))

    await expect(useVILabServerStore.getState().testConnection({
      mode: 'local',
      base_url: 'http://draft-server',
    })).rejects.toThrow('connection refused')

    const state = useVILabServerStore.getState()
    expect(state.connection).toEqual(savedConnection)
    expect(state.models).toEqual([{ id: 'saved-model', modelType: 'asr' }])
    expect(state.error).toBe('connection refused')
  })

  it('clears stale test evidence and models when saving a changed connection', async () => {
    useVILabServerStore.setState({ testResult: {
      ok: true,
      status: 'connected',
      base_url: 'http://draft-server',
      models: [{ id: 'draft-model' }],
      readiness: {
        audioMeeting: { ready: false, missing: ['asr', 'diarization'], selectedModels: {} },
        transcriptNote: { ready: false, missing: ['llm'], selectedModels: {} },
      },
    } })
    apiJsonMock.mockResolvedValue({ ...savedConnection, base_url: 'http://new-server' })

    await useVILabServerStore.getState().saveConnection({
      mode: 'local',
      base_url: 'http://new-server',
    })

    const state = useVILabServerStore.getState()
    expect(state.connection?.base_url).toBe('http://new-server')
    expect(state.connection?.status).toBe('untested')
    expect(state.testResult).toBeNull()
    expect(state.models).toEqual([])
    expect(state.readiness).toBeNull()
  })
})
