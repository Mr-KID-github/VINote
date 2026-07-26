import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Plus, RotateCcw, Trash2, Wifi } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { type ModelProfile, type ModelProfileDraft, type ProviderType } from '../../lib/modelProfiles'
import { useModelProfileStore } from '../../stores/modelProfileStore'

const providerOptions: Array<{
  value: ProviderType
  label: string
  defaultBaseUrl: string
}> = [
  { value: 'openai-compatible', label: 'OpenAI Compatible', defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic-compatible', label: 'Anthropic Compatible', defaultBaseUrl: 'https://api.anthropic.com/v1' },
  { value: 'azure-openai', label: 'Azure OpenAI', defaultBaseUrl: 'https://your-resource.openai.azure.com' },
  { value: 'ollama', label: 'Ollama', defaultBaseUrl: 'http://localhost:11434/v1' },
  { value: 'groq-openai-compatible', label: 'Groq OpenAI Compatible', defaultBaseUrl: 'https://api.groq.com/openai/v1' },
]

const makeDraft = (): ModelProfileDraft => ({
  name: '',
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  modelName: '',
  apiKey: '',
  isDefault: false,
  isActive: true,
})

const profileToDraft = (profile: ModelProfile): ModelProfileDraft => ({
  name: profile.name,
  provider: profile.provider,
  baseUrl: profile.baseUrl,
  modelName: profile.modelName,
  apiKey: '',
  isDefault: profile.isDefault,
  isActive: profile.isActive,
})

export function ModelProfileManager() {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ModelProfileDraft>(makeDraft)
  const formRef = useRef<HTMLFormElement>(null)
  const { copy } = useI18n()

  const {
    profiles,
    loading,
    saving,
    error,
    lastTestResult,
    profileTestResults,
    testingProfileIds,
    loadProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    setDefaultProfile,
    testDraft,
    testProfile,
  } = useModelProfileStore()

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  const resetForm = () => {
    setEditingId(null)
    setDraft(makeDraft())
  }

  const editingProfile = editingId ? profiles.find((profile) => profile.id === editingId) : null
  const editingDefaultProfile = Boolean(editingProfile?.isDefault)

  const startEdit = (profile: ModelProfile) => {
    setEditingId(profile.id)
    setDraft(profileToDraft(profile))
  }

  const readFormDraft = (): ModelProfileDraft => {
    const form = formRef.current
    if (!form) {
      return draft
    }

    const formData = new FormData(form)
    const field = (name: string, fallback: string) => {
      const value = formData.get(name)
      return typeof value === 'string' ? value : fallback
    }

    return {
      name: field('name', draft.name),
      provider: field('provider', draft.provider) as ProviderType,
      baseUrl: field('baseUrl', draft.baseUrl),
      modelName: field('modelName', draft.modelName),
      apiKey: field('apiKey', draft.apiKey),
      isDefault: editingDefaultProfile || formData.has('isDefault'),
      isActive: formData.has('isActive'),
    }
  }

  const handleSavedProfileTest = async (profile: ModelProfile) => {
    startEdit(profile)
    await testProfile(profile.id)
  }

  const handleSetDefaultProfile = async (profile: ModelProfile) => {
    await setDefaultProfile(profile.id)
    if (editingId === profile.id) {
      setDraft((current) => ({ ...current, isDefault: true }))
    }
  }

  const formatConnectionResult = (result: typeof lastTestResult) => {
    if (!result) {
      return ''
    }
    return result.ok
      ? copy.modelProfiles.connectionSucceeded(result.latencyMs)
      : copy.modelProfiles.connectionFailed(result.errorMessage || copy.modelProfiles.unknownError)
  }

  const handleProviderChange = (provider: ProviderType) => {
    const previousMeta = providerOptions.find((item) => item.value === draft.provider)
    const meta = providerOptions.find((item) => item.value === provider)
    setDraft((current) => ({
      ...current,
      provider,
      baseUrl:
        !current.baseUrl.trim() || current.baseUrl === previousMeta?.defaultBaseUrl
          ? meta?.defaultBaseUrl || ''
          : current.baseUrl,
    }))
  }

  const handleSave = async () => {
    if (!formRef.current?.reportValidity()) {
      return
    }

    const formDraft = readFormDraft()
    if (editingId) {
      await updateProfile(editingId, formDraft)
    } else {
      await createProfile(formDraft)
    }
    resetForm()
  }

  const handleTest = async () => {
    const formDraft = readFormDraft()
    if (editingId && !formDraft.apiKey.trim()) {
      await testProfile(editingId)
      return
    }
    await testDraft(formDraft)
  }

  return (
    <section className="rounded-[28px] border border-gray-200 bg-gradient-to-br from-white to-gray-50/80 p-5 shadow-sm dark:border-gray-800 dark:from-[#191919] dark:to-[#141414] lg:p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#1b1b1b] sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold">{copy.modelProfiles.title}</h3>
                <span className="rounded-full bg-primary-light/10 px-2.5 py-1 text-xs font-medium text-primary-light dark:bg-primary-dark/10 dark:text-primary-dark">
                  {profiles.length}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">{copy.modelProfiles.body}</p>
            </div>
            <button
              onClick={resetForm}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-gray-200 px-4 py-2.5 font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {copy.modelProfiles.newProfile}
            </button>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#1b1b1b]">{copy.modelProfiles.loading}</div>
          ) : profiles.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-[#1b1b1b] dark:text-gray-400">
              {copy.modelProfiles.empty}
            </div>
          ) : (
            <div className="stealth-scroll max-h-[620px] space-y-3 overflow-y-auto pr-1">
              {profiles.map((profile) => {
                const profileResult = profileTestResults?.[profile.id]
                const isTestingProfile = testingProfileIds?.includes(profile.id)
                return (
                <div
                  key={profile.id}
                  className="rounded-3xl border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-[#1b1b1b] dark:hover:border-gray-700"
                >
                  <div className="space-y-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{profile.name}</h4>
                        {profile.isDefault && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-light/10 text-primary-light dark:bg-primary-dark/10 dark:text-primary-dark">
                            {copy.modelProfiles.default}
                          </span>
                        )}
                        {!profile.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {copy.modelProfiles.inactive}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {profile.provider} / {profile.modelName}
                      </p>
                      <p className="mt-2 break-all text-xs leading-5 text-gray-400">{profile.baseUrl}</p>
                      <p className="mt-1 text-xs text-gray-400">{copy.modelProfiles.keyPrefix} {profile.apiKeyHint}</p>
                      {(isTestingProfile || profileResult) && (
                        <p
                          className={clsx(
                            'mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            isTestingProfile
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                              : profileResult?.ok
                                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                          )}
                        >
                          {isTestingProfile ? '测试中...' : formatConnectionResult(profileResult)}
                        </p>
                      )}
                    </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void handleSavedProfileTest(profile)}
                        disabled={isTestingProfile}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                        title={copy.modelProfiles.testConnection}
                      >
                        <Wifi className="w-4 h-4" />
                        {copy.modelProfiles.testConnection}
                      </button>
                      <button
                        onClick={() => startEdit(profile)}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        {copy.modelProfiles.edit}
                      </button>
                      {!profile.isDefault && (
                        <button
                          onClick={() => void handleSetDefaultProfile(profile)}
                          className="rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                          {copy.modelProfiles.setDefault}
                        </button>
                      )}
                      <button
                        onClick={() => void deleteProfile(profile.id)}
                        className="rounded-xl border border-red-200 p-2 text-red-500 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20"
                        title={copy.modelProfiles.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <form
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
            className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b]"
          >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{editingId ? copy.modelProfiles.editTitle : copy.modelProfiles.createTitle}</h3>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                  {editingId ? copy.modelProfiles.edit : copy.modelProfiles.newProfile}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{copy.modelProfiles.connectionBody}</p>
            </div>
            <button
              onClick={resetForm}
              className="rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              title={copy.modelProfiles.resetForm}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{copy.modelProfiles.name}</label>
            <input
              name="name"
              required
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder={copy.modelProfiles.namePlaceholder}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] outline-none focus:ring-2 focus:ring-primary-light"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{copy.modelProfiles.provider}</label>
            <select
              name="provider"
              value={draft.provider}
              onChange={(event) => handleProviderChange(event.target.value as ProviderType)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] outline-none focus:ring-2 focus:ring-primary-light"
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{copy.modelProfiles.baseUrl}</label>
            <input
              name="baseUrl"
              required
              value={draft.baseUrl}
              onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder={providerOptions.find((item) => item.value === draft.provider)?.defaultBaseUrl}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] outline-none focus:ring-2 focus:ring-primary-light"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{copy.modelProfiles.model}</label>
            <input
              name="modelName"
              required
              value={draft.modelName}
              onChange={(event) => setDraft((current) => ({ ...current, modelName: event.target.value }))}
              placeholder={copy.modelProfiles.modelPlaceholder}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] outline-none focus:ring-2 focus:ring-primary-light"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {copy.modelProfiles.apiKey} {editingId ? <span className="text-xs text-gray-400">{copy.modelProfiles.keepCurrentKey}</span> : null}
            </label>
            <input
              name="apiKey"
              required={!editingId}
              type="password"
              value={draft.apiKey}
              onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder={editingId ? copy.modelProfiles.apiKeyEditPlaceholder : copy.modelProfiles.apiKeyCreatePlaceholder}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] outline-none focus:ring-2 focus:ring-primary-light"
            />
          </div>

          <label className="flex items-center gap-3">
            <input
              name="isDefault"
              type="checkbox"
              checked={draft.isDefault}
              disabled={editingDefaultProfile}
              onChange={(event) => setDraft((current) => ({ ...current, isDefault: editingDefaultProfile || event.target.checked }))}
              className="w-4 h-4"
            />
            <span className="text-sm">{copy.modelProfiles.useAsDefault}</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              name="isActive"
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
              className="w-4 h-4"
            />
            <span className="text-sm">{copy.modelProfiles.profileIsActive}</span>
          </label>

          {(error || lastTestResult) && (
            <div
              className={clsx(
                'p-3 rounded-lg text-sm',
                lastTestResult?.ok
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              )}
            >
              {error || (
                lastTestResult?.ok
                  ? copy.modelProfiles.connectionSucceeded(lastTestResult.latencyMs)
                  : copy.modelProfiles.connectionFailed(lastTestResult?.errorMessage || copy.modelProfiles.unknownError)
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              <Wifi className="w-4 h-4" />
              {copy.modelProfiles.testConnection}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary-light px-4 py-3 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-60 dark:bg-primary-dark"
            >
              {editingId ? copy.modelProfiles.saveChanges : copy.modelProfiles.createProfile}
            </button>
          </div>
          </form>
        </aside>
      </div>
    </section>
  )
}
