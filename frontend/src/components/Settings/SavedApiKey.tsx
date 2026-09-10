import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { apiJson } from '../../lib/api'
import { useI18n } from '../../lib/i18n'

export function SavedApiKey({ kind, profileId, hint }: {
  kind: 'model' | 'stt'; profileId: string; hint: string
}) {
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const generation = useRef(0)
  const { copy } = useI18n()
  const zh = copy.locale.startsWith('zh')
  useEffect(() => {
    const hide = () => { generation.current++; setSecret(''); setLoading(false) }
    window.addEventListener('blur', hide)
    return () => { generation.current++; window.removeEventListener('blur', hide) }
  }, [])
  useEffect(() => {
    if (!secret) return
    const timer = window.setTimeout(() => setSecret(''), 30000)
    return () => window.clearTimeout(timer)
  }, [secret])
  async function toggle() {
    if (secret) { setSecret(''); return }
    const request = ++generation.current
    setLoading(true)
    setError(false)
    try {
      const result = await apiJson<{ api_key: string }>(`/api/${kind}-profiles/${profileId}/reveal-key`, { method: 'POST', cache: 'no-store' })
      if (request === generation.current) setSecret(result.api_key)
    } catch { if (request === generation.current) setError(true) }
    finally { if (request === generation.current) setLoading(false) }
  }
  if (!hint) return <span className="text-xs text-gray-400">{zh ? '未保存密钥' : 'No saved key'}</span>
  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
    <span>{zh ? '已保存密钥' : 'Saved key'}</span>
    <code className="break-all">{secret || hint}</code>
    <button type="button" disabled={loading} onClick={() => void toggle()} aria-label={secret ? (zh ? '隐藏密钥' : 'Hide key') : (zh ? '显示已保存密钥' : 'Show saved key')} aria-pressed={Boolean(secret)} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
      {secret ? <EyeOff size={14} /> : <Eye size={14} />}
      {loading ? '…' : secret ? (zh ? '隐藏' : 'Hide') : (zh ? '显示' : 'Show')}
    </button>
    {error && <span role="alert">{zh ? '读取失败，请重试' : 'Could not load key. Retry.'}</span>}
  </div>
}
