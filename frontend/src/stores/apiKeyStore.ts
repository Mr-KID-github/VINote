import { create } from 'zustand'
import {
  createAPIKey,
  fetchAPIKeys,
  revokeAPIKey,
  type APIKey,
  type APIKeyCreateResult,
} from '../lib/apiKeys'

interface APIKeyState {
  keys: APIKey[]
  loading: boolean
  saving: boolean
  error: string
  createdKey: APIKeyCreateResult | null
  loadKeys: () => Promise<void>
  createKey: (name: string) => Promise<APIKeyCreateResult>
  revokeKey: (id: string) => Promise<void>
  clearCreatedKey: () => void
}

const emptyState = {
  keys: [] as APIKey[],
  loading: false,
  saving: false,
  error: '',
  createdKey: null as APIKeyCreateResult | null,
}

export const useAPIKeyStore = create<APIKeyState>((set, get) => ({
  ...emptyState,
  loadKeys: async () => {
    set({ loading: true, error: '' })
    try {
      const keys = await fetchAPIKeys()
      set({ keys, loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load API keys',
      })
    }
  },
  createKey: async (name) => {
    set({ saving: true, error: '', createdKey: null })
    try {
      const created = await createAPIKey(name)
      set({
        keys: [created, ...get().keys],
        saving: false,
        createdKey: created,
      })
      return created
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to create API key',
      })
      throw error
    }
  },
  revokeKey: async (id) => {
    set({ saving: true, error: '' })
    try {
      await revokeAPIKey(id)
      set({
        keys: get().keys.filter((key) => key.id !== id),
        saving: false,
      })
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to revoke API key',
      })
      throw error
    }
  },
  clearCreatedKey: () => set({ createdKey: null }),
}))
