import { apiJson } from './api'

export interface APIKey {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt?: string | null
  createdAt: string
  revokedAt?: string | null
}

export interface APIKeyCreateResult extends APIKey {
  apiKey: string
}

type ApiKey = {
  id: string
  name: string
  key_prefix: string
  last_used_at?: string | null
  created_at: string
  revoked_at?: string | null
}

type ApiKeyCreateResult = ApiKey & {
  api_key: string
}

const mapApiKey = (key: ApiKey): APIKey => ({
  id: key.id,
  name: key.name,
  keyPrefix: key.key_prefix,
  lastUsedAt: key.last_used_at,
  createdAt: key.created_at,
  revokedAt: key.revoked_at,
})

const mapCreatedApiKey = (key: ApiKeyCreateResult): APIKeyCreateResult => ({
  ...mapApiKey(key),
  apiKey: key.api_key,
})

export async function fetchAPIKeys() {
  const data = await apiJson<ApiKey[]>('/api/api-keys')
  return data.map(mapApiKey)
}

export async function createAPIKey(name: string) {
  const data = await apiJson<ApiKeyCreateResult>('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return mapCreatedApiKey(data)
}

export async function revokeAPIKey(id: string) {
  await apiJson<void>(`/api/api-keys/${id}`, { method: 'DELETE' })
}
