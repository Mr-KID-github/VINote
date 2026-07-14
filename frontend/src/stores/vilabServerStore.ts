import { create } from 'zustand'
import { apiJson } from '../lib/api'

export type VILabServerMode = 'local' | 'remote'
export type VILabServerStatus = 'connected' | 'disconnected' | 'failed' | 'untested'

export interface VILabServerConnection {
  mode: VILabServerMode
  base_url: string
  api_key_hint: string
  status: VILabServerStatus
  version?: string | null
  latency_ms?: number | null
  checked_at?: string | null
  using_env_fallback?: boolean
  readiness?: VILabReadiness | null
}

export interface VILabServerModel {
  id: string
  provider?: string
  modelType?: string
  model_type?: string
  runtimeStatus?: string
  runtime_status?: string
  streaming?: boolean
  supportsStreaming?: boolean
  requiresKey?: boolean
  requires_key?: boolean
  [key: string]: unknown
}

export interface VILabServerConnectionDraft {
  mode: VILabServerMode
  base_url: string
  api_key?: string
}

export interface VILabServerConnectionTestResult {
  ok: boolean
  status: VILabServerStatus
  base_url: string
  version?: string | null
  latency_ms?: number | null
  models: VILabServerModel[]
  readiness: VILabReadiness
}

export interface VILabPipelineReadiness {
  ready: boolean
  missing: string[]
  selectedModels: Record<string, string>
}

export interface VILabReadiness {
  audioMeeting: VILabPipelineReadiness
  transcriptNote: VILabPipelineReadiness
}

interface VILabServerStore {
  connection: VILabServerConnection | null
  models: VILabServerModel[]
  readiness: VILabReadiness | null
  testResult: VILabServerConnectionTestResult | null
  loading: boolean
  testing: boolean
  saving: boolean
  error: string
  loadConnection: () => Promise<void>
  saveConnection: (draft: VILabServerConnectionDraft) => Promise<VILabServerConnection>
  testConnection: (draft?: VILabServerConnectionDraft) => Promise<VILabServerConnectionTestResult>
  loadModels: () => Promise<void>
  clearError: () => void
}

export const useVILabServerStore = create<VILabServerStore>((set) => ({
  connection: null,
  models: [],
  readiness: null,
  testResult: null,
  loading: false,
  testing: false,
  saving: false,
  error: '',
  clearError: () => set({ error: '' }),
  loadConnection: async () => {
    set({ loading: true, error: '' })
    try {
      const connection = await apiJson<VILabServerConnection>('/api/vilab-server/connection')
      set({ connection, readiness: connection.readiness ? normalizeReadiness(connection.readiness) : null, loading: false })
      if (connection.status === 'connected') {
        void useVILabServerStore.getState().loadModels()
      }
    } catch (error) {
      set({ connection: null, models: [], readiness: null, loading: false, error: error instanceof Error ? error.message : 'Failed to load VILab Server connection' })
    }
  },
  saveConnection: async (draft) => {
    set({ saving: true, error: '' })
    try {
      const connection = await apiJson<VILabServerConnection>('/api/vilab-server/connection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      set({ connection, models: [], readiness: null, testResult: null, saving: false })
      return connection
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save VILab Server connection'
      set({ saving: false, error: message })
      throw error
    }
  },
  testConnection: async (draft) => {
    set({ testing: true, error: '', testResult: null })
    try {
      const options: RequestInit = draft
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          }
        : { method: 'POST' }
      const payload = await apiJson<VILabServerConnectionTestResult>('/api/vilab-server/connection/test', options)
      const result = {
        ...payload,
        models: Array.isArray(payload.models) ? payload.models : [],
        readiness: normalizeReadiness(payload.readiness),
      }
      set((state) => draft
        ? { testing: false, testResult: result }
        : {
            testing: false,
            testResult: null,
            models: result.models,
            readiness: result.readiness,
            connection: state.connection
              ? { ...state.connection, status: result.status, version: result.version, latency_ms: result.latency_ms }
              : null,
          })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      set((state) => draft
        ? { testing: false, testResult: null, error: message }
        : {
            testing: false,
            testResult: null,
            models: [],
            readiness: null,
            error: message,
            connection: state.connection ? { ...state.connection, status: 'failed' } : null,
          })
      throw error
    }
  },
  loadModels: async () => {
    set({ loading: true, error: '' })
    try {
      const payload = await apiJson<{ data: VILabServerModel[]; readiness?: unknown }>('/api/vilab-server/models')
      set({
        models: Array.isArray(payload.data) ? payload.data : [],
        readiness: normalizeReadiness(payload.readiness),
        loading: false,
      })
    } catch (error) {
      set({ loading: false, models: [], readiness: null, error: error instanceof Error ? error.message : 'Failed to load VILab Server models' })
    }
  },
}))

const EMPTY_READINESS: VILabReadiness = {
  audioMeeting: { ready: false, missing: ['asr', 'diarization', 'llm'], selectedModels: {} },
  transcriptNote: { ready: false, missing: ['llm'], selectedModels: {} },
}

function normalizeReadiness(value: unknown): VILabReadiness {
  const payload = value && typeof value === 'object' ? value as Partial<VILabReadiness> : {}
  return {
    audioMeeting: normalizePipelineReadiness(payload.audioMeeting, EMPTY_READINESS.audioMeeting),
    transcriptNote: normalizePipelineReadiness(payload.transcriptNote, EMPTY_READINESS.transcriptNote),
  }
}

function normalizePipelineReadiness(value: unknown, fallback: VILabPipelineReadiness): VILabPipelineReadiness {
  const payload = value && typeof value === 'object' ? value as Partial<VILabPipelineReadiness> : {}
  const selectedModels = payload.selectedModels && typeof payload.selectedModels === 'object'
    ? Object.fromEntries(Object.entries(payload.selectedModels).map(([key, model]) => [key, String(model)]))
    : fallback.selectedModels
  return {
    ready: payload.ready === true,
    missing: Array.isArray(payload.missing) ? payload.missing.map(String) : fallback.missing,
    selectedModels,
  }
}

export function describeMissingModels(readiness: VILabPipelineReadiness | null | undefined) {
  if (!readiness || readiness.ready) return ''
  return readiness.missing.length ? readiness.missing.join(', ') : 'required models'
}
