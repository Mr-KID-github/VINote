import { Mail } from 'lucide-react'
import { useI18n } from '../../lib/i18n'

interface ProfileSettingsPanelProps {
  email?: string
}

export function ProfileSettingsPanel({ email }: ProfileSettingsPanelProps) {
  const { copy } = useI18n()

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{copy.settings.email}</label>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-500 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-300">
          <Mail className="w-4 h-4" />
          {email || copy.settings.notSignedIn}
        </div>
      </div>
    </div>
  )
}
