import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { NoteGrid } from '../components/Notes/NoteGrid'
import { useNoteLibraryStore } from '../stores/noteLibraryStore'
import { getWorkspaceLabel, useTeamStore } from '../stores/teamStore'

export function Home() {
  const navigate = useNavigate()
  const { copy, locale } = useI18n()
  const { notes, loading, loadNotes } = useNoteLibraryStore()
  const { currentWorkspace, teams } = useTeamStore()
  const isZh = locale.startsWith('zh')
  const workspaceLabel = getWorkspaceLabel(currentWorkspace, teams, isZh ? '个人空间' : 'Personal workspace')

  useEffect(() => {
    void loadNotes(currentWorkspace)
  }, [currentWorkspace, loadNotes])

  const recentNotes = notes.slice(0, 6)

  return (
    <div className="space-y-8 p-8">
      <section className="rounded-3xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-blue-50 p-8 dark:border-gray-700 dark:from-[#202020] dark:via-[#1f1f1f] dark:to-[#18263a]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{copy.home.eyebrow}</p>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{copy.home.title}</h2>
            <p className="text-gray-600 dark:text-gray-300">
              {copy.home.body} {isZh ? `当前目标工作区：${workspaceLabel}。` : `Current save target: ${workspaceLabel}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/generate')}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-light px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90 dark:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              {copy.home.newNote}
            </button>
            <button
              type="button"
              onClick={() => navigate('/notes')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {copy.home.viewLibrary}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{copy.home.recentNotes}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isZh ? `${workspaceLabel}里最近保存的内容。` : `Latest saved items from ${workspaceLabel}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/notes')}
            className="text-sm font-medium text-primary-light dark:text-primary-dark"
          >
            {copy.home.seeAll}
          </button>
        </div>

        <NoteGrid
          notes={recentNotes}
          loading={loading}
          emptyTitle={copy.home.emptyTitle}
          emptyBody={copy.home.emptyBody}
          onOpen={(note) => navigate(`/note/${note.id}`)}
        />
      </section>
    </div>
  )
}
