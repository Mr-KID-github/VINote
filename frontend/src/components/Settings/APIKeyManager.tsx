import { useEffect, useState } from 'react'
import { Check, Clipboard, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { useAPIKeyStore } from '../../stores/apiKeyStore'

export function APIKeyManager() {
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const { copy, formatDate } = useI18n()
  const {
    keys,
    loading,
    saving,
    error,
    createdKey,
    loadKeys,
    createKey,
    revokeKey,
    clearCreatedKey,
  } = useAPIKeyStore()

  useEffect(() => {
    void loadKeys()
  }, [loadKeys])

  const canCreate = Boolean(name.trim()) && !saving

  const handleCreate = async () => {
    if (!canCreate) {
      return
    }
    await createKey(name.trim())
    setName('')
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!createdKey) {
      return
    }
    await navigator.clipboard.writeText(createdKey.apiKey)
    setCopied(true)
  }

  return (
    <section className="rounded-[28px] border border-gray-200 bg-gradient-to-br from-white to-gray-50/80 p-5 shadow-sm dark:border-gray-800 dark:from-[#191919] dark:to-[#141414] lg:p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#1b1b1b] sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold">{copy.apiKeys.title}</h3>
                <span className="rounded-full bg-primary-light/10 px-2.5 py-1 text-xs font-medium text-primary-light dark:bg-primary-dark/10 dark:text-primary-dark">
                  {keys.length}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                {copy.apiKeys.body}
              </p>
            </div>
          </div>

          {createdKey && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-emerald-900 dark:text-emerald-100">
                    {copy.apiKeys.createdTitle}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-emerald-700 dark:text-emerald-200">
                    {copy.apiKeys.createdBody}
                  </p>
                  <code className="mt-4 block overflow-x-auto rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-[#111] dark:text-emerald-100">
                    {createdKey.apiKey}
                  </code>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleCopy()}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-[#151515] dark:text-emerald-100 dark:hover:bg-emerald-900/20"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                    {copied ? copy.apiKeys.copied : copy.apiKeys.copy}
                  </button>
                  <button
                    onClick={clearCreatedKey}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-[#151515] dark:text-emerald-100 dark:hover:bg-emerald-900/20"
                  >
                    {copy.apiKeys.dismiss}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#1b1b1b]">
              {copy.apiKeys.loading}
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-[#1b1b1b] dark:text-gray-400">
              {copy.apiKeys.empty}
            </div>
          ) : (
            <div className="stealth-scroll max-h-[620px] space-y-3 overflow-y-auto pr-1">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="rounded-3xl border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-[#1b1b1b] dark:hover:border-gray-700"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary-light dark:text-primary-dark" />
                        <h4 className="font-medium">{key.name}</h4>
                      </div>
                      <p className="mt-2 break-all text-sm text-gray-500 dark:text-gray-400">
                        {copy.apiKeys.prefix} <span className="font-mono">{key.keyPrefix}</span>
                      </p>
                      <p className="mt-2 text-xs text-gray-400">
                        {copy.apiKeys.createdAt} {formatDate(key.createdAt)}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {copy.apiKeys.lastUsed} {key.lastUsedAt ? formatDate(key.lastUsedAt) : copy.apiKeys.neverUsed}
                      </p>
                    </div>
                    <button
                      onClick={() => void revokeKey(key.id)}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/30 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      {copy.apiKeys.revoke}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <section className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b]">
            <div>
              <h3 className="text-lg font-semibold">{copy.apiKeys.createTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {copy.apiKeys.createBody}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">{copy.apiKeys.name}</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={copy.apiKeys.namePlaceholder}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none transition-colors focus:border-primary-light dark:border-gray-700 dark:bg-[#202020] dark:focus:border-primary-dark"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={() => void handleCreate()}
              disabled={!canCreate}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-light px-4 py-3 font-semibold text-white transition-colors hover:bg-primary-light/90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-primary-dark dark:hover:bg-primary-dark/90"
            >
              <Plus className="h-4 w-4" />
              {saving ? copy.apiKeys.saving : copy.apiKeys.create}
            </button>
          </section>
        </aside>
      </div>
    </section>
  )
}
