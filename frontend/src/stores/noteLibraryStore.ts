import { create } from 'zustand'
import { apiJson } from '../lib/api'

type NoteRow = {
  id: string
  title: string
  content: string
  video_url: string | null
  source_type: string | null
  task_id: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface NoteRecord {
  id: string
  title: string
  content: string
  videoUrl?: string
  sourceType?: string
  taskId?: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface NoteShareRecord {
  noteId: string
  title: string
  shareEnabled: boolean
  shareToken?: string
  shareUrl?: string
  shareCreatedAt?: string
}

interface NoteLibraryState {
  notes: NoteRecord[]
  loading: boolean
  error: string
  loadNotes: () => Promise<void>
  loadNoteById: (id: string) => Promise<NoteRecord | null>
  saveNote: (title: string, content: string, videoUrl?: string, taskId?: string, sourceType?: string) => Promise<NoteRecord | null>
  updateNote: (id: string, title: string, content: string) => Promise<NoteRecord | null>
  deleteNote: (id: string) => Promise<void>
  createShareLink: (id: string) => Promise<NoteShareRecord | null>
  getShareLink: (id: string) => Promise<NoteShareRecord | null>
  disableShareLink: (id: string) => Promise<NoteShareRecord | null>
  reset: () => void
}

const initialState = {
  notes: [] as NoteRecord[],
  loading: false,
  error: '',
}

const mapRow = (row: NoteRow): NoteRecord => ({
  id: row.id,
  title: row.title,
  content: row.content ?? '',
  videoUrl: row.video_url ?? undefined,
  sourceType: row.source_type ?? undefined,
  taskId: row.task_id ?? undefined,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapShareRow = (row: {
  note_id: string
  title: string
  share_enabled: boolean
  share_token?: string | null
  share_url?: string | null
  share_created_at?: string | null
}): NoteShareRecord => ({
  noteId: row.note_id,
  title: row.title,
  shareEnabled: row.share_enabled,
  shareToken: row.share_token ?? undefined,
  shareUrl: row.share_url ?? undefined,
  shareCreatedAt: row.share_created_at ?? undefined,
})

export const useNoteLibraryStore = create<NoteLibraryState>((set, get) => ({
  ...initialState,
  loadNotes: async () => {
    set({ loading: true, error: '' })

    try {
      const data = await apiJson<NoteRow[]>('/api/notes')
      set({ notes: data.map(mapRow), loading: false })
    } catch (error) {
      console.error('Failed to load notes:', error)
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load notes',
      })
    }
  },
  loadNoteById: async (id) => {
    const existing = get().notes.find((note) => note.id === id)
    if (existing) {
      return existing
    }

    try {
      const data = await apiJson<NoteRow>(`/api/notes/${id}`)
      const note = mapRow(data)
      set((state) => ({
        notes: state.notes.some((item) => item.id === note.id) ? state.notes : [note, ...state.notes],
      }))
      return note
    } catch (error) {
      console.error('Failed to load note:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to load note',
      })
      return null
    }
  },
  saveNote: async (title, content, videoUrl, taskId, sourceType) => {
    try {
      const normalizedTitle = title.trim() || 'Untitled note'
      const data = await apiJson<NoteRow>('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: normalizedTitle,
          content,
          video_url: videoUrl || null,
          task_id: taskId || null,
          source_type: sourceType || (videoUrl ? 'video' : 'file'),
          status: 'done',
        }),
      })
      const note = mapRow(data)
      set((state) => ({
        notes: [note, ...state.notes.filter((item) => item.id !== note.id)],
        error: '',
      }))
      return note
    } catch (error) {
      console.error('Failed to save note:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to save note',
      })
      return null
    }
  },
  updateNote: async (id, title, content) => {
    try {
      const normalizedTitle = title.trim() || 'Untitled note'
      const data = await apiJson<NoteRow>(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: normalizedTitle, content }),
      })
      const note = mapRow(data)
      set((state) => ({
        notes: state.notes.map((item) => (item.id === id ? note : item)),
        error: '',
      }))
      return note
    } catch (error) {
      console.error('Failed to update note:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to update note',
      })
      return null
    }
  },
  deleteNote: async (id) => {
    try {
      await apiJson<void>(`/api/notes/${id}`, { method: 'DELETE' })

      set((state) => ({
        notes: state.notes.filter((item) => item.id !== id),
        error: '',
      }))
    } catch (error) {
      console.error('Failed to delete note:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to delete note',
      })
    }
  },
  createShareLink: async (id) => {
    try {
      const data = await apiJson<{
        note_id: string
        title: string
        share_enabled: boolean
        share_token?: string | null
        share_url?: string | null
        share_created_at?: string | null
      }>(`/api/notes/${id}/share`, {
        method: 'POST',
      })
      set({ error: '' })
      return mapShareRow(data)
    } catch (error) {
      console.error('Failed to create share link:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to create share link',
      })
      return null
    }
  },
  getShareLink: async (id) => {
    try {
      const data = await apiJson<{
        note_id: string
        title: string
        share_enabled: boolean
        share_token?: string | null
        share_url?: string | null
        share_created_at?: string | null
      }>(`/api/notes/${id}/share`)
      set({ error: '' })
      return mapShareRow(data)
    } catch (error) {
      console.error('Failed to load share link:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to load share link',
      })
      return null
    }
  },
  disableShareLink: async (id) => {
    try {
      const data = await apiJson<{
        note_id: string
        title: string
        share_enabled: boolean
        share_token?: string | null
        share_url?: string | null
        share_created_at?: string | null
      }>(`/api/notes/${id}/share`, {
        method: 'DELETE',
      })
      set({ error: '' })
      return mapShareRow(data)
    } catch (error) {
      console.error('Failed to disable share link:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to disable share link',
      })
      return null
    }
  },
  reset: () => set(initialState),
}))
