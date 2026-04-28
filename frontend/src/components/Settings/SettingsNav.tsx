import clsx from 'clsx'
import { Bell, Bot, KeyRound, Palette, Shield, User, type LucideIcon } from 'lucide-react'
import { useI18n } from '../../lib/i18n'

export type SettingsTab = 'profile' | 'models' | 'apiKeys' | 'team' | 'appearance' | 'notifications'

type TabConfig = {
  key: SettingsTab
  label: string
  icon: LucideIcon
}

interface SettingsNavProps {
  activeTab: SettingsTab
  onChange: (tab: SettingsTab) => void
}

export function SettingsNav({ activeTab, onChange }: SettingsNavProps) {
  const { copy } = useI18n()
  const tabs: TabConfig[] = [
    { key: 'profile', label: copy.settings.profile, icon: User },
    { key: 'models', label: copy.settings.models, icon: Bot },
    { key: 'apiKeys', label: copy.settings.apiKeys, icon: KeyRound },
    { key: 'team', label: copy.settings.team, icon: Shield },
    { key: 'appearance', label: copy.settings.appearance, icon: Palette },
    { key: 'notifications', label: copy.settings.notifications, icon: Bell },
  ]

  return (
    <nav className="w-52 space-y-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
            activeTab === tab.key
              ? 'bg-primary-light/10 dark:bg-primary-dark/10 text-primary-light dark:text-primary-dark'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
          )}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
