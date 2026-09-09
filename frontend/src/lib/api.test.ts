import { afterEach, expect, it, vi } from 'vitest'
import { apiJson } from './api'

afterEach(() => vi.unstubAllGlobals())

it('sends JSON headers for authentication payloads', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  await apiJson('/api/auth/code', { method: 'POST', body: JSON.stringify({ email: 'test@example.com' }) })
  expect(fetchMock.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json')
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
})

it('shows validation messages without object coercion', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:[{msg:'Invalid email'}]}), {
    status:422, headers:{'Content-Type':'application/json'},
  })))
  await expect(apiJson('/api/auth/code')).rejects.toThrow('Invalid email')
})

it('lets the browser set the multipart boundary for uploads', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {headers:{'Content-Type':'application/json'}}))
  vi.stubGlobal('fetch', fetchMock)
  await apiJson('/api/upload', {method:'POST', body:new FormData()})
  expect(fetchMock.mock.calls[0][1].headers.has('Content-Type')).toBe(false)
})
