import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

export function EmailLogin({ isLogin, onSwitch }: { isLogin: boolean; onSwitch: () => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    if (!seconds) return
    const timer = window.setTimeout(() => setSeconds(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds])
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : '登录失败，请重试') }
    finally { setBusy(false) }
  }
  const field = 'w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-primary-light dark:border-gray-700 dark:bg-[#191919] dark:text-gray-100'
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault()
    void run(async () => {
      if (!isLogin && password !== confirmation) throw new Error('两次密码不一致')
      await apiJson(isLogin ? '/api/auth/sign-in' : '/api/auth/register/verify', { method: 'POST', body: JSON.stringify(isLogin ? {email, password} : {email, code}) })
      await useAuthStore.getState().initialize()
      if (!useAuthStore.getState().user) throw new Error('登录会话未建立，请重试')
      navigate('/')
    })
  }}>
    <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{isLogin ? '使用邮箱和密码登录，登录后即可使用云端模型。' : '设置密码并验证邮箱，创建你的 VINote 账号。'}</p>
    <label className="block text-sm font-medium">邮箱<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={`${field} mt-1`} /></label>
    <label className="block text-sm font-medium">密码<input required type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={6} maxLength={128} disabled={!isLogin && seconds > 0} value={password} onChange={e => setPassword(e.target.value)} className={`${field} mt-1`} /></label>
    {!isLogin && <>
    <label className="block text-sm font-medium">确认密码<input required type="password" autoComplete="new-password" disabled={seconds > 0} value={confirmation} onChange={e => setConfirmation(e.target.value)} className={`${field} mt-1`} /></label>
    <div className="flex gap-3 items-end">
      <label className="block min-w-0 flex-1 text-sm font-medium">验证码<input required inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={10} value={code} onChange={e => setCode(e.target.value)} className={`${field} mt-1`} /></label>
      <button type="button" disabled={busy || !email || password.length < 6 || password !== confirmation || seconds > 0} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2.5 text-sm disabled:opacity-50 dark:border-gray-700" onClick={() => void run(async () => {
        await apiJson('/api/auth/register/code', {method:'POST', body:JSON.stringify({email, password})})
        setSeconds(60); setMessage('验证码已发送，请检查邮箱')
      })}>{seconds ? `${seconds} 秒后重发` : '获取验证码'}</button>
    </div>
    </>}
    {message && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">{message}</p>}
    <button disabled={busy} className="w-full rounded-lg bg-primary-light px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-primary-dark">{busy ? '处理中…' : isLogin ? '登录' : '注册'}</button>
    <button type="button" disabled={busy} className="w-full text-center text-sm text-primary-light hover:underline" onClick={() => { onSwitch(); setMessage(''); setCode('') }}>{isLogin ? '没有账号？创建账号' : '已有账号？返回登录'}</button>
  </form>
}
