import { useEffect, useState } from 'react'
import { apiJson } from '../../lib/api'

type Account = { configured: boolean; authenticated: boolean; email?: string }
const inputClass = 'w-full min-w-0 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] outline-none focus:ring-2 focus:ring-primary-light'
const secondaryClass = 'shrink-0 rounded-xl border border-gray-200 px-4 py-2.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed'

export function CloudAccountPanel({ onConnected }: { onConnected: () => void }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [resendSeconds, setResendSeconds] = useState(0)
  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds(value => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])
  useEffect(() => {
    let active = true
    apiJson<Account>('/api/vilab/account').then(value => { if (active) setAccount(value) })
      .catch(() => { if (active) setMessage('无法读取云端账号状态') })
    return () => { active = false }
  }, [])
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败') }
    finally { setBusy(false) }
  }
  if (account && !account.configured) return null
  return <div className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b]">
    <h4 className="text-lg font-semibold">VINote 云端账号</h4>
    {account?.authenticated ? <>
      <p className="text-sm text-gray-500 dark:text-gray-400">{account.email} · 已登录</p>
      <button className={secondaryClass} disabled={busy} onClick={() => void run(async () => {
        const result = await apiJson<{ remote_revoked: boolean }>('/api/vilab/account', { method: 'DELETE' })
        setAccount({ configured: true, authenticated: false }); onConnected()
        if (!result.remote_revoked) setMessage('本地云端会话已清除，上游会话撤销暂未完成。')
      })}>退出云端账号</button>
    </> : <>
      <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">使用邮箱验证码注册或登录 VINote，登录后即可使用云端模型。</p>
      <div>
      <label htmlFor="cloud-account-email" className="mb-2 block text-sm font-medium">云端账号邮箱</label>
      <div className="flex flex-col gap-3 sm:flex-row">
      <input id="cloud-account-email" aria-label="云端账号邮箱" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="请输入邮箱" className={inputClass} />
      <button className={secondaryClass} disabled={busy || !email || resendSeconds > 0} onClick={() => void run(async () => {
        await apiJson('/api/vilab/account/code', { method: 'POST', body: JSON.stringify({ email }) })
        setResendSeconds(60)
        setMessage('验证码已发送，请检查邮箱')
      })}>{resendSeconds > 0 ? `${resendSeconds} 秒后重发` : '发送验证码'}</button>
      </div>
      </div>
      <div>
      <label htmlFor="cloud-account-code" className="mb-2 block text-sm font-medium">邮箱验证码</label>
      <input id="cloud-account-code" aria-label="邮箱验证码" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} placeholder="请输入验证码" className={inputClass} />
      </div>
      <button className="rounded-xl bg-primary-light px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-primary-dark" disabled={busy || !email || code.length < 6} onClick={() => void run(async () => {
        const value = await apiJson<Account>('/api/vilab/account/verify', { method: 'POST', body: JSON.stringify({ email, code }) })
        setAccount(value); setCode(''); onConnected()
      })}>注册 / 登录</button>
    </>}
    {message && <p role="status" className="text-sm leading-6 text-gray-500 dark:text-gray-400">{message}</p>}
  </div>
}
