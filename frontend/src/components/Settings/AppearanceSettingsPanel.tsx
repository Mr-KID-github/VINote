import clsx from 'clsx'
import { useI18n } from '../../lib/i18n'
import type { LanguageCode } from '../../stores/languageStore'

type ThemeMode = 'light' | 'dark' | 'system'

interface AppearanceSettingsPanelProps {
  theme: ThemeMode
  language: LanguageCode
  onThemeChange: (theme: ThemeMode) => void
  onLanguageChange: (language: LanguageCode) => void | Promise<void>
}

export function AppearanceSettingsPanel({
  theme,
  language,
  onThemeChange,
  onLanguageChange,
}: AppearanceSettingsPanelProps) {
  const { copy } = useI18n()

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{copy.theme.title}</h3>
        <div className="space-y-2">
          {(['light', 'dark', 'system'] as const).map((value) => (
            <label
              key={value}
              className={clsx(
                'flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
                theme === value
                  ? 'border-primary-light dark:border-primary-dark bg-primary-light/5 dark:bg-primary-dark/5'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              )}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={theme === value}
                onChange={() => onThemeChange(value)}
              />
              <span className="text-gray-900 dark:text-gray-100">
                {value === 'light' ? copy.theme.light : value === 'dark' ? copy.theme.dark : copy.theme.system}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{copy.language.title}</h3>
        {([
          { value: 'zh-CN', label: copy.language.chinese },
          { value: 'en', label: copy.language.english },
        ] as const).map((option) => (
          <label
            key={option.value}
            className={clsx(
              'flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
              language === option.value
                ? 'border-primary-light dark:border-primary-dark bg-primary-light/5 dark:bg-primary-dark/5'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
            )}
          >
            <input
              type="radio"
              name="language"
              value={option.value}
              checked={language === option.value}
              onChange={() => void onLanguageChange(option.value)}
            />
            <span className="text-gray-900 dark:text-gray-100">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
