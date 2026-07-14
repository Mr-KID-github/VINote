import { readRuntimeConfig } from './runtimeConfig'

const API_BASE = readRuntimeConfig('VITE_API_BASE_URL')

export function apiUrl(path: string) {
  return `${API_BASE}${path}`
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {})

  return fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  })
}

export async function apiJson<T>(path: string, init: RequestInit = {}) {
  const response = await apiFetch(path, init)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : payload?.detail || payload?.error_message || 'Request failed'
    throw new Error(message)
  }

  return payload as T
}
