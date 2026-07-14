const DB_NAME = 'vinote-meeting-audio'
const DB_VERSION = 1
const STORE_NAME = 'recordings'
const RECOVERY_KEY = 'vinote.meeting.recovery'

export interface RecordingRecovery {
  id: string
  startedAt: string
  mimeType: string
  meetingSessionId?: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('indexeddb_unsupported'))
  if (dbPromise) return dbPromise
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close()
        dbPromise = null
      }
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('indexeddb_open_failed'))
    request.onblocked = () => reject(new Error('indexeddb_open_blocked'))
  })
  dbPromise = pending.catch((error) => {
    dbPromise = null
    throw error
  })
  return dbPromise
}

export async function saveRecordedAudio(recovery: RecordingRecovery, blob: Blob): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('indexeddb_unsupported')
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(blob, recovery.id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb_write_failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb_write_aborted'))
  })
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(recovery))
}

export async function loadRecordedAudio(): Promise<{ recovery: RecordingRecovery; blob: Blob } | null> {
  if (typeof indexedDB === 'undefined') return null
  const raw = localStorage.getItem(RECOVERY_KEY)
  if (!raw) return null
  let recovery: RecordingRecovery
  try {
    recovery = JSON.parse(raw) as RecordingRecovery
    if (!recovery.id || !recovery.startedAt) {
      localStorage.removeItem(RECOVERY_KEY)
      return null
    }
  } catch {
    localStorage.removeItem(RECOVERY_KEY)
    return null
  }
  try {
    const db = await openDatabase()
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(recovery.id)
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error('indexeddb_read_failed'))
    })
    if (!blob) {
      localStorage.removeItem(RECOVERY_KEY)
      return null
    }
    return { recovery, blob }
  } catch {
    // Preserve the pointer when IndexedDB is temporarily unavailable so a later retry can recover it.
    return null
  }
}

export async function deleteRecordedAudio(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb_delete_failed'))
    })
  } finally {
    const raw = localStorage.getItem(RECOVERY_KEY)
    if (raw) {
      try {
        const recovery = JSON.parse(raw) as RecordingRecovery
        if (recovery.id === id) localStorage.removeItem(RECOVERY_KEY)
      } catch {
        localStorage.removeItem(RECOVERY_KEY)
      }
    }
  }
}

export function generateRecordingId() {
  const id = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `rec-${id}`
}
