import { apiJson } from './api'

export type ProviderType =
  | 'openai-compatible'
  | 'anthropic-compatible'
  | 'azure-openai'
  | 'ollama'
  | 'groq-openai-compatible'

export interface ModelProfile {
  id: string
  name: string
  provider: ProviderType
  baseUrl: string
  modelName: string
  apiKeyHint: string
  isDefault: boolean
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ModelProfileDraft {
  name: string
  provider: ProviderType
  baseUrl: string
  modelName: string
  apiKey: string
  isDefault: boolean
  isActive: boolean
}

export interface ConnectionTestResult {
  ok: boolean
  provider: ProviderType
  model: string
  latencyMs: number
  errorMessage: string
}

export interface OllamaModel {
  name: string
  model: string
  modifiedAt?: string
  size?: number
  parameterSize: string
  quantizationLevel: string
}

type ApiProfile = {
  id: string
  name: string
  provider: ProviderType
  base_url: string
  model_name: string
  api_key_hint: string
  is_default: boolean
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type ApiTestResult = {
  ok: boolean
  provider: ProviderType
  model: string
  latency_ms: number
  error_message: string
}

type ApiOllamaModel = {
  name: string
  model: string
  modified_at?: string
  size?: number
  parameter_size: string
  quantization_level: string
}

const mapProfile = (profile: ApiProfile): ModelProfile => ({
  id: profile.id,
  name: profile.name,
  provider: profile.provider,
  baseUrl: profile.base_url,
  modelName: profile.model_name,
  apiKeyHint: profile.api_key_hint,
  isDefault: profile.is_default,
  isActive: profile.is_active,
  createdAt: profile.created_at,
  updatedAt: profile.updated_at,
})

const mapTestResult = (result: ApiTestResult): ConnectionTestResult => ({
  ok: result.ok,
  provider: result.provider,
  model: result.model,
  latencyMs: result.latency_ms,
  errorMessage: result.error_message,
})

const mapOllamaModel = (model: ApiOllamaModel): OllamaModel => ({
  name: model.name,
  model: model.model,
  modifiedAt: model.modified_at,
  size: model.size,
  parameterSize: model.parameter_size,
  quantizationLevel: model.quantization_level,
})

const buildDraftPayload = (draft: Partial<ModelProfileDraft>) => {
  const payload: Record<string, unknown> = {}
  if (draft.name !== undefined) payload.name = draft.name
  if (draft.provider !== undefined) payload.provider = draft.provider
  if (draft.baseUrl !== undefined && draft.provider !== 'ollama')
    payload.base_url = draft.baseUrl
  if (draft.modelName !== undefined) payload.model_name = draft.modelName
  if (
    draft.apiKey !== undefined &&
    draft.apiKey.trim() &&
    draft.provider !== 'ollama'
  )
    payload.api_key = draft.apiKey
  if (draft.isDefault !== undefined) payload.is_default = draft.isDefault
  if (draft.isActive !== undefined) payload.is_active = draft.isActive
  return payload
}

export async function fetchModelProfiles() {
  const data = await apiJson<ApiProfile[]>('/api/model-profiles')
  return data.map(mapProfile)
}

export async function createModelProfile(draft: ModelProfileDraft) {
  const data = await apiJson<ApiProfile>('/api/model-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDraftPayload(draft)),
  })
  return mapProfile(data)
}

export async function updateModelProfile(
  id: string,
  draft: Partial<ModelProfileDraft>,
) {
  const data = await apiJson<ApiProfile>(`/api/model-profiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDraftPayload(draft)),
  })
  return mapProfile(data)
}

export async function deleteModelProfile(id: string) {
  await apiJson<void>(`/api/model-profiles/${id}`, { method: 'DELETE' })
}

export async function setDefaultModelProfile(id: string) {
  const data = await apiJson<ApiProfile>(
    `/api/model-profiles/${id}/set-default`,
    { method: 'POST' },
  )
  return mapProfile(data)
}

export async function testModelProfileDraft(draft: ModelProfileDraft) {
  const data = await apiJson<ApiTestResult>('/api/model-profiles/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDraftPayload(draft)),
  })
  return mapTestResult(data)
}

export async function testSavedModelProfile(id: string) {
  const data = await apiJson<ApiTestResult>(`/api/model-profiles/${id}/test`, {
    method: 'POST',
  })
  return mapTestResult(data)
}

export async function fetchOllamaModels(signal?: AbortSignal) {
  const data = await apiJson<ApiOllamaModel[]>(
    '/api/model-profiles/ollama/models',
    { signal },
  )
  return data.map(mapOllamaModel)
}
