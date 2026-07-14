import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Box, CheckCircle2, Eye, Globe2, Monitor, RefreshCw, Wifi } from 'lucide-react'
import { describeMissingModels, useVILabServerStore, type VILabPipelineReadiness, type VILabServerMode, type VILabServerModel } from '../../stores/vilabServerStore'

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:9876'

function modelType(model: VILabServerModel) {
  return String(model.modelType || model.model_type || '').toLowerCase()
}

function modelProvider(model: VILabServerModel) {
  return String(model.provider || model.runtime || 'server')
}

function runtimeStatus(model: VILabServerModel) {
  return String(model.runtimeStatus || model.runtime_status || model.status || 'unknown')
}

function PipelineStatus({ title, readiness }: { title: string; readiness?: VILabPipelineReadiness | null }) {
  const ready = readiness?.ready === true
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'}`}>
      <div className="flex items-start gap-2">
        {ready ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertTriangle className="mt-0.5 h-4 w-4" />}
        <div>
          <p className="font-medium">{title}: {ready ? 'Ready' : 'Not ready'}</p>
          {!ready ? <p className="mt-1">Missing ready models: {describeMissingModels(readiness)}.</p> : null}
        </div>
      </div>
    </div>
  )
}

function supportsStreaming(model: VILabServerModel) {
  return Boolean(model.streaming ?? model.supportsStreaming)
}

function requiresKey(model: VILabServerModel) {
  return Boolean(model.requiresKey ?? model.requires_key)
}

function ModelRows({ title, models }: { title: string; models: VILabServerModel[] }) {
  if (!models.length) return null
  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        {models.map((model) => (
          <div key={String(model.id)} className="grid gap-2 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 dark:border-gray-800 md:grid-cols-[1.5fr_1fr_1fr_auto_auto]">
            <span className="font-medium text-gray-900 dark:text-gray-100">{String(model.id)}</span>
            <span className="text-gray-500 dark:text-gray-400">{modelProvider(model)}</span>
            <span className="text-gray-500 dark:text-gray-400">{runtimeStatus(model)}</span>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {supportsStreaming(model) ? 'Streaming' : 'Batch'}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {requiresKey(model) ? 'Key required' : 'Server key'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function VILabServerSettingsPanel() {
  const { connection, models, readiness, testResult, loading, testing, saving, error, loadConnection, saveConnection, testConnection, loadModels, clearError } = useVILabServerStore()
  const [mode, setMode] = useState<VILabServerMode>('local')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_LOCAL_URL)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [inlineMessage, setInlineMessage] = useState('')

  useEffect(() => {
    void loadConnection()
  }, [loadConnection])

  useEffect(() => {
    if (connection) {
      setMode(connection.mode)
      setBaseUrl(connection.base_url || DEFAULT_LOCAL_URL)
    }
  }, [connection])

  const connected = connection?.status === 'connected'
  const displayModels = testResult?.models || models
  const displayReadiness = testResult?.readiness || readiness
  const canDisplayModels = connected || testResult?.status === 'connected'
  const speechModels = useMemo(() => displayModels.filter((model) => modelType(model) === 'asr'), [displayModels])
  const diarizationModels = useMemo(() => displayModels.filter((model) => modelType(model) === 'diarization'), [displayModels])
  const languageModels = useMemo(() => displayModels.filter((model) => modelType(model) === 'llm'), [displayModels])
  const displayBaseUrl = testResult?.base_url || connection?.base_url || baseUrl
  const adminUrl = displayBaseUrl ? `${displayBaseUrl.replace(/\/$/, '')}/admin/` : ''

  const draft = { mode, base_url: baseUrl, api_key: apiKey || undefined }

  const handleTest = async () => {
    clearError()
    setInlineMessage('')
    try {
      await testConnection(draft)
      setInlineMessage('Connection test succeeded.')
    } catch (err) {
      setInlineMessage(err instanceof Error ? err.message : 'Connection test failed.')
    }
  }

  const handleSave = async () => {
    clearError()
    setInlineMessage('')
    try {
      await saveConnection(draft)
      await testConnection()
      await loadConnection()
      setApiKey('')
      setInlineMessage('Connection saved.')
    } catch (err) {
      setInlineMessage(err instanceof Error ? err.message : 'Failed to save connection.')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b]">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">VILab Server</h3>
          <span className="hidden text-gray-300 sm:inline">•</span>
          <span className={connected ? 'text-sm text-emerald-600' : 'text-sm text-gray-500'}>{connected ? 'Connected' : 'Not connected'}</span>
        </div>
        <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">Connect VINote to a VILab Server to browse available models.</p>

        <div className="rounded-3xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-6 grid grid-cols-2 rounded-xl border border-gray-200 p-1 dark:border-gray-800">
            {(['local', 'remote'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value)
                  if (value === 'local' && !baseUrl) setBaseUrl(DEFAULT_LOCAL_URL)
                }}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${mode === value ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:ring-blue-800' : 'text-gray-700 dark:text-gray-300'}`}
              >
                {value === 'local' ? <Monitor className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}
                {value === 'local' ? 'Local' : 'Remote'}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">Server URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 dark:border-gray-800 dark:bg-gray-950"
                placeholder="http://127.0.0.1:9876"
              />
              <span className="mt-2 block text-xs text-gray-500">Base URL for your VILab Server instance.</span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">API key (optional)</span>
              <div className="relative">
                <input
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  type={showKey ? 'text' : 'password'}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-11 text-sm outline-none focus:border-blue-400 dark:border-gray-800 dark:bg-gray-950"
                  placeholder={connection?.api_key_hint || 'Leave blank to keep saved key'}
                />
                <button type="button" aria-label="Toggle API key visibility" onClick={() => setShowKey((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <Eye className="h-4 w-4" />
                </button>
              </div>
              <span className="mt-2 block text-xs text-gray-500">Leave blank if your server does not require a key.</span>
            </label>
          </div>

          {(inlineMessage || error) && (
            <p className={error ? 'mt-4 text-sm text-red-600' : 'mt-4 text-sm text-emerald-600'}>{error || inlineMessage}</p>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={handleTest} disabled={testing || !baseUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-900">
              <Wifi className="h-4 w-4" />
              {testing ? 'Testing...' : 'Test connection'}
            </button>
            <button type="button" onClick={handleSave} disabled={saving || testing || !baseUrl} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving...' : 'Connect'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Models from server</h3>
          <button type="button" onClick={loadModels} disabled={!connected || loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50 dark:border-gray-800 dark:text-gray-100">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {!canDisplayModels ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-gray-200 text-center dark:border-gray-800">
            <Box className="mb-4 h-10 w-10 text-gray-400" />
            <p className="font-semibold text-gray-900 dark:text-gray-100">Connect to load available models</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">Once connected, your speech and language models from the server will appear here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2">
              <PipelineStatus title="Audio meeting pipeline" readiness={displayReadiness?.audioMeeting} />
              <PipelineStatus title="Transcript note pipeline" readiness={displayReadiness?.transcriptNote} />
            </div>
            {displayReadiness?.audioMeeting.ready !== true || displayReadiness?.transcriptNote.ready !== true ? (
              <p className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">
                Configure, download, and activate missing models in VILab Server Admin.{' '}
                <a href={adminUrl} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">Open Admin</a>
              </p>
            ) : null}
            <ModelRows title="Speech models" models={speechModels} />
            <ModelRows title="Diarization models" models={diarizationModels} />
            <ModelRows title="Language models" models={languageModels} />
            {!speechModels.length && !diarizationModels.length && !languageModels.length && <p className="rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-gray-800">No models returned by this VILab Server.</p>}
          </div>
        )}
      </section>
    </div>
  )
}
