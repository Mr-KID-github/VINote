import { Cloud, Monitor } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppModeStore } from '../../stores/appModeStore'
import { useI18n } from '../../lib/i18n'

export function AppModeSwitch() {
  const { config, saving, error, setMode, load } = useAppModeStore()
  const navigate = useNavigate()
  const { locale } = useI18n()
  const zh = locale.startsWith('zh')
  return <div className="relative flex items-center gap-3">
    <span className="hidden text-xs font-medium text-gray-500 xl:inline">{zh ? '全局运行模式' : 'App mode'}</span>
    <div role="group" aria-label={zh ? '全局运行模式' : 'App mode'} className="flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-[#151515]">
      {(['cloud', 'local'] as const).map(mode => <button key={mode} type="button" disabled={saving || !config} aria-pressed={config?.mode === mode}
        onClick={() => void setMode(mode)}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${config?.mode === mode ? 'bg-primary-light text-white shadow-sm' : 'text-gray-500 hover:bg-white dark:hover:bg-gray-800'}`}>
        {mode === 'cloud' ? <Cloud size={16} /> : <Monitor size={16} />}
        {mode === 'cloud' ? (zh ? '云端' : 'Cloud') : (zh ? '本地' : 'Local')}
      </button>)}
    </div>
    <button type="button" className="text-xs text-primary-light hover:underline" onClick={() => navigate('/settings?tab=models')}>{zh ? '模型配置' : 'Configure'}</button>
    {error && <div role="alert" className="absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-red-200 bg-white p-3 text-xs text-red-600 shadow-lg dark:bg-gray-900">
      {zh ? '无法同步运行模式，请检查本地服务。' : 'Could not sync app mode. Check the local service.'}
      <button className="ml-2 underline" onClick={() => void load()}>{zh ? '重试' : 'Retry'}</button>
    </div>}
  </div>
}
