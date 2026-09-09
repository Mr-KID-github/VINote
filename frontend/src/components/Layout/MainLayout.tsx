import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MeetingRecorderDock } from '../MeetingRecorder/MeetingRecorderDock'
import { APP_MODE_EVENT, useAppModeStore } from '../../stores/appModeStore'
import { useAuthStore } from '../../stores/authStore'

const SIDEBAR_COLLAPSED_KEY = 'vinote.sidebar.collapsed'

export function MainLayout() {
  const userId = useAuthStore(state => state.user?.id)
  useEffect(() => {
    useAppModeStore.getState().reset()
    if (!userId) return
    const sync = () => { void useAppModeStore.getState().load() }
    const onStorage = (event: StorageEvent) => { if (event.key === APP_MODE_EVENT) sync() }
    sync()
    window.addEventListener('focus', sync)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('focus', sync); window.removeEventListener('storage', onStorage); useAppModeStore.getState().reset() }
  }, [userId])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="min-h-0 flex flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} />
        <main className="stealth-scroll flex-1 overflow-auto bg-white text-gray-900 dark:bg-[#191919] dark:text-gray-100">
          <Outlet />
        </main>
      </div>
      <MeetingRecorderDock />
    </div>
  )
}
