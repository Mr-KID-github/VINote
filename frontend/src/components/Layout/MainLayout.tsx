import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MeetingRecorderDock } from '../MeetingRecorder/MeetingRecorderDock'

export function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-white dark:bg-[#191919]">
          <Outlet />
        </main>
        <MeetingRecorderDock />
      </div>
    </div>
  )
}
