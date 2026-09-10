import { useState } from 'react'
import { apiJson } from '../lib/api'

export function PasswordRecovery({ email: initialEmail, onBack }: { email: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentAt, setSentAt] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : '请求失败，请重试') }
    finally { setBusy(false) }
  }
  const field = 'mt-1 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-primary-light dark:border-gray-700 dark:bg-[#191919] dark:text-gray-100'
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault()
    void run(async () => {
      if (password !== confirmation) throw new Error('两次密码不一致')
      const result = await apiJson<{message: string}>('/api/auth/password/reset', {method: 'POST', body: JSON.stringify({email, code, password})})
      setMessage(result.message); setDone(true); setPassword(''); setConfirmation(''); setCode('')
    })
  }}>
    <p className="text-sm text-gray-500">通过邮箱验证重设密码，保留原账号及笔记。设置后请返回登录。</p>
    {!done && <>
      <label className="block text-sm font-medium">邮箱<input type="email" autoComplete="email" required disabled={busy} value={email} onChange={e => { setEmail(e.target.value); setCode('') }} className={field} /></label>
      <button type="button" disabled={busy || !email} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={() => void run(async () => {
        if (Date.now() - sentAt < 60000) throw new Error('请等待 60 秒后再获取验证码')
        const result = await apiJson<{message: string}>('/api/auth/password/code', {method: 'POST', body: JSON.stringify({email})})
        setSentAt(Date.now()); setMessage(result.message)
      })}>获取重设密码验证码</button>
      <label className="block text-sm font-medium">验证码<input required inputMode="numeric" pattern="[0-9]{6,10}" autoComplete="one-time-code" disabled={busy} value={code} onChange={e => setCode(e.target.value.trim())} className={field} /></label>
      <label className="block text-sm font-medium">新密码<input required type="password" minLength={6} maxLength={128} autoComplete="new-password" disabled={busy} value={password} onChange={e => setPassword(e.target.value)} className={field} /></label>
      <label className="block text-sm font-medium">确认新密码<input required type="password" autoComplete="new-password" disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)} className={field} /></label>
      <button disabled={busy} className="w-full rounded-lg bg-primary-light px-4 py-3 text-white disabled:opacity-50">{busy ? '处理中…' : '确认重设密码'}</button>
    </>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
    <button type="button" disabled={busy} onClick={onBack} className="w-full text-center text-sm text-primary-light hover:underline">返回登录</button>
  </form>
}
