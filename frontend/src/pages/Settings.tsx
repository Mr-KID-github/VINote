import { useState } from 'react'
import { Shield } from 'lucide-react'
import { AppearanceSettingsPanel } from '../components/Settings/AppearanceSettingsPanel'
import { APIKeyManager } from '../components/Settings/APIKeyManager'
import { ModelProfileManager } from '../components/Settings/ModelProfileManager'
import { NotificationSettingsPanel } from '../components/Settings/NotificationSettingsPanel'
import { PlaceholderSettingsPanel } from '../components/Settings/PlaceholderSettingsPanel'
import { ProfileSettingsPanel } from '../components/Settings/ProfileSettingsPanel'
import { STTProfileManager } from '../components/Settings/STTProfileManager'
import { SettingsNav, type SettingsTab } from '../components/Settings/SettingsNav'
import { useI18n } from '../lib/i18n'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const { user } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const { copy, language, setLanguage } = useI18n()

  return (
    <div className="max-w-[1440px] mx-auto p-6 lg:p-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100 lg:mb-8">{copy.settings.title}</h2>

      <div className="flex flex-col gap-8 lg:flex-row">
        <SettingsNav activeTab={activeTab} onChange={setActiveTab} />

        <div className="flex-1">
          {activeTab === 'profile' && <ProfileSettingsPanel email={user?.email} />}
          {activeTab === 'models' && (
            <div className="space-y-8">
              <ModelProfileManager />
              <STTProfileManager />
            </div>
          )}
          {activeTab === 'apiKeys' && <APIKeyManager />}
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
