import { create } from 'zustand'
import { apiFetch, apiJson } from '../lib/api'
import { useModelProfileStore } from './modelProfileStore'
import { useNoteLibraryStore } from './noteLibraryStore'
import { useTeamStore } from './teamStore'

export interface AuthUser {
  id: string
  email: string
}

interface SessionResponse {
  authenticated: boolean
  user: AuthUser | null
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
  initialize: () => Promise<void>
  signUp: (email: string, password: string) => Promise<{ error: Error | null; user: AuthUser | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null; user: AuthUser | null }>
  signOut: () => Promise<void>
}

const clearUserState = () => {
  useModelProfileStore.getState().reset()
  useNoteLibraryStore.getState().reset()
  useTeamStore.getState().reset()
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  initialize: async () => {
    try {
      const session = await apiJson<SessionResponse>('/api/auth/session')
      if (!session.authenticated || !session.user) {
        clearUserState()
        set({ user: null, initialized: true })
        return
      }

      set({ user: session.user, initialized: true })
    } catch {
      clearUserState()
      set({ user: null, initialized: true })
    }
  },
  signUp: async (email, password) => {
    set({ loading: true })
    try {
      const user = await apiJson<AuthUser>('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      set({ loading: false, user, initialized: true })
      return { error: null, user }
    } catch (error) {
      set({ loading: false })
      return { error: error instanceof Error ? error : new Error('Sign up failed'), user: null }
    }
  },
  signIn: async (email, password) => {
    set({ loading: true })
    try {
      const user = await apiJson<AuthUser>('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      set({ loading: false, user, initialized: true })
      return { error: null, user }
    } catch (error) {
      set({ loading: false })
      return { error: error instanceof Error ? error : new Error('Sign in failed'), user: null }
    }
  },
  signOut: async () => {
    await apiFetch('/api/auth/sign-out', { method: 'POST' })
    clearUserState()
    set({ user: null })
  },
}))
