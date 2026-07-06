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

interface VILabServerStore {
  connection: VILabServerConnection | null
  models: VILabServerModel[]
  loading: boolean
  testing: boolean
  saving: boolean
  error: string
  loadConnection: () => Promise<void>
  saveConnection: (draft: VILabServerConnectionDraft) => Promise<VILabServerConnection>
  testConnection: (draft: VILabServerConnectionDraft) => Promise<void>
  loadModels: () => Promise<void>
  clearError: () => void
}

export const useVILabServerStore = create<VILabServerStore>((set) => ({
  connection: null,
  models: [],
  loading: false,
  testing: false,
  saving: false,
  error: '',
  clearError: () => set({ error: '' }),
  loadConnection: async () => {
    set({ loading: true, error: '' })
    try {
      const connection = await apiJson<VILabServerConnection>('/api/vilab-server/connection')
      set({ connection, loading: false })
      if (connection.status === 'connected') {
        void useVILabServerStore.getState().loadModels()
      }
    } catch (error) {
      set({ connection: null, models: [], loading: false, error: error instanceof Error ? error.message : 'Failed to load VILab Server connection' })
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
      set({ connection, saving: false })
      return connection
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save VILab Server connection'
      set({ saving: false, error: message })
      throw error
    }
  },
  testConnection: async (draft) => {
    set({ testing: true, error: '' })
    try {
      const result = await apiJson<{ ok: boolean; models: VILabServerModel[]; status: VILabServerStatus; version?: string; latency_ms?: number }>('/api/vilab-server/connection/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      set((state) => ({
        testing: false,
        models: result.models || [],
        connection: state.connection
          ? { ...state.connection, status: result.status, version: result.version, latency_ms: result.latency_ms }
          : null,
      }))
    } catch (error) {
      set({ testing: false, models: [], error: error instanceof Error ? error.message : 'Connection failed' })
      throw error
    }
  },
  loadModels: async () => {
    set({ loading: true, error: '' })
    try {
      const payload = await apiJson<{ data: VILabServerModel[] }>('/api/vilab-server/models')
      set({ models: Array.isArray(payload.data) ? payload.data : [], loading: false })
    } catch (error) {
      set({ loading: false, models: [], error: error instanceof Error ? error.message : 'Failed to load VILab Server models' })
    }
  },
}))
