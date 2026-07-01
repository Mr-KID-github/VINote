import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { NoteGrid } from '../components/Notes/NoteGrid'
import { useNoteLibraryStore } from '../stores/noteLibraryStore'
import { getWorkspaceLabel, useTeamStore } from '../stores/teamStore'

export function Notes() {
  const navigate = useNavigate()
  const { copy, locale } = useI18n()
  const { notes, loading, loadNotes } = useNoteLibraryStore()
  const { currentWorkspace, teams } = useTeamStore()
  const isZh = locale.startsWith('zh')
  const workspaceLabel = getWorkspaceLabel(currentWorkspace, teams, isZh ? '个人空间' : 'Personal workspace')

  useEffect(() => {
    void loadNotes(currentWorkspace)
  }, [currentWorkspace, loadNotes])

  return (
    <div className="space-y-6 p-8">
      <div>
        <h2 className="text-2xl font-bold">{copy.notes.title}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isZh ? `${workspaceLabel}下保存的全部笔记。` : `All saved notes in ${workspaceLabel}.`}
        </p>
      </div>

      <NoteGrid
        notes={notes}
        loading={loading}
        emptyTitle={copy.notes.emptyTitle}
        emptyBody={copy.notes.emptyBody}
        onOpen={(note) => navigate(`/note/${note.id}`)}
      />
    </div>
  )
}
