import { type LucideIcon } from 'lucide-react'

interface PlaceholderSettingsPanelProps {
  icon: LucideIcon
  title: string
  body: string
}

export function PlaceholderSettingsPanel({ icon: Icon, title, body }: PlaceholderSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{title}</h3>
      <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-xl text-center">
        <Icon className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400">{body}</p>
      </div>
    </div>
  )
}
