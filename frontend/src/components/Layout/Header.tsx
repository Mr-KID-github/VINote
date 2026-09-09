import { Bell, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Search, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../lib/i18n'
import { useAuthStore } from '../../stores/authStore'
import { ThemeToggle } from './ThemeToggle'
import { AppModeSwitch } from './AppModeSwitch'

const brandMarkUrl = `${import.meta.env.BASE_URL}vinote-mark.svg`

interface HeaderProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export function Header({ sidebarCollapsed, onToggleSidebar }: HeaderProps) {
  const { user, signOut } = useAuthStore()
  const { copy, locale } = useI18n()
  const navigate = useNavigate()
  const isZh = locale.startsWith('zh')

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#202020]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
          title={sidebarCollapsed ? (isZh ? '展开侧边栏' : 'Expand sidebar') : (isZh ? '收起侧边栏' : 'Collapse sidebar')}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
        <div className="flex items-center gap-2">
          <img src={brandMarkUrl} alt="" className="h-8 w-8" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">VINote</h1>
        </div>
        <div className="ml-2 border-l border-gray-200 pl-4 dark:border-gray-700"><AppModeSwitch /></div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden xl:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={copy.header.searchPlaceholder}
            className="w-64 pl-9 pr-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#191919] focus:ring-2 focus:ring-primary-light dark:focus:ring-primary-dark focus:border-transparent outline-none transition-all"
          />
        </div>

        <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">
          <Bell className="w-5 h-5" />
        </button>

        <ThemeToggle />

        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={() => navigate('/generate')}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-light dark:bg-primary-dark text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {copy.header.newButton}
          </button>
        </div>

        <button
          onClick={handleSignOut}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 ml-2"
          title={copy.header.signOut}
        >
          <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        <button className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          {user?.email ? (
            <div className="w-8 h-8 rounded-full bg-primary-light dark:bg-primary-dark flex items-center justify-center text-white text-sm font-medium">
              {user.email[0].toUpperCase()}
            </div>
          ) : (
            <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>
    </header>
  )
}
