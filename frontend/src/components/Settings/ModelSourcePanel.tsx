import { useAppModeStore } from '../../stores/appModeStore'
import { ModelProfileManager } from './ModelProfileManager'
import { STTProfileManager } from './STTProfileManager'

export function ModelSourcePanel({ compact = false }: { compact?: boolean }) {
  const { config, saving, error, setMode } = useAppModeStore()
  return <div className="space-y-6">
    <section className="space-y-4 rounded-3xl border border-gray-200 p-6 dark:border-gray-800">
      <h3 className="text-xl font-semibold">{compact ? '云端服务' : '全局运行模式'}</h3>
      {!compact && <div className="flex gap-3">{(['cloud', 'local'] as const).map(mode => <button key={mode} disabled={saving || !config} aria-pressed={config?.mode === mode}
        className={`rounded-xl border px-5 py-3 ${config?.mode === mode ? 'border-primary-light bg-primary-light/10' : 'border-gray-300 dark:border-gray-700'}`}
        onClick={() => void setMode(mode)}>{mode === 'cloud' ? '云端模型' : '本地 / 自定义'}</button>)}</div>}
      {config?.mode === 'cloud' && <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">自动使用云端当前配置，无需选择模型或填写密钥。</p>}
      {config?.mode === 'local' && <p className="text-sm text-gray-500">使用本机语音模型，或自行配置模型服务。</p>}
      {error && <p role="status" className="text-sm text-red-600">{error}</p>}
    </section>
    {config?.mode === 'local' && <><ModelProfileManager /><STTProfileManager /></>}
  </div>
}
