import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ModelSourcePanel } from '../components/Settings/ModelSourcePanel'
import { Shield } from 'lucide-react'
import { AppearanceSettingsPanel } from '../components/Settings/AppearanceSettingsPanel'
import { NotificationSettingsPanel } from '../components/Settings/NotificationSettingsPanel'
import { PlaceholderSettingsPanel } from '../components/Settings/PlaceholderSettingsPanel'
import { ProfileSettingsPanel } from '../components/Settings/ProfileSettingsPanel'
import { SettingsNav, type SettingsTab } from '../components/Settings/SettingsNav'
import { useI18n } from '../lib/i18n'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const location = useLocation()
  useEffect(() => { if (new URLSearchParams(location.search).get('tab') === 'models') setActiveTab('models') }, [location.search])
  const { user } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const { copy, language, setLanguage } = useI18n()

  return (
    <div className="w-full p-6 lg:p-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100 lg:mb-8">{copy.settings.title}</h2>

      <div className="flex flex-col gap-6 lg:flex-row">
        <SettingsNav activeTab={activeTab} onChange={setActiveTab} />

        <div className="min-w-0 flex-1">
          {activeTab === 'profile' && <ProfileSettingsPanel email={user?.email} />}
          {activeTab === 'models' && (
            <ModelSourcePanel />
          )}
          {activeTab === 'team' && (
            <PlaceholderSettingsPanel
              icon={Shield}
              title={copy.settings.team}
              body={copy.settings.teamBody}
            />
          )}
          {activeTab === 'appearance' && (
            <AppearanceSettingsPanel
              theme={theme}
              language={language}
              onThemeChange={setTheme}
              onLanguageChange={setLanguage}
            />
          )}
          {activeTab === 'notifications' && <NotificationSettingsPanel />}
        </div>
      </div>
    </div>
  )
}
