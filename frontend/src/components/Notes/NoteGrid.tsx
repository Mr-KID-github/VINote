import { FileText } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import type { NoteRecord } from '../../stores/noteLibraryStore'

interface NoteGridProps {
  notes: NoteRecord[]
  loading?: boolean
  emptyTitle: string
  emptyBody: string
  onOpen: (note: NoteRecord) => void
}

export function NoteGrid({ notes, loading = false, emptyTitle, emptyBody, onOpen }: NoteGridProps) {
  const { copy, formatDate, locale } = useI18n()
  const isZh = locale.startsWith('zh')

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100">
        {copy.common.loading}
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-900 dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100">
        <FileText className="mx-auto mb-4 h-10 w-10 text-gray-300 dark:text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{emptyTitle}</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{emptyBody}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => onOpen(note)}
          className="rounded-2xl border border-gray-200 bg-white p-5 text-left text-gray-900 transition-colors hover:border-primary-light dark:border-gray-700 dark:bg-[#202020] dark:text-gray-100 dark:hover:border-primary-dark"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{note.title}</h3>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-[#161616] dark:text-gray-300">
              {note.scope === 'team' ? note.teamName || (isZh ? '团队' : 'Team') : (isZh ? '个人' : 'Personal')}
            </span>
          </div>
          <p className="mt-3 line-clamp-4 text-sm text-gray-500 dark:text-gray-400">
            {note.content || copy.notes.noContent}
          </p>
          <p className="mt-4 text-xs text-gray-400">
            {formatDate(note.updatedAt || note.createdAt)}
          </p>
        </button>
      ))}
    </div>
  )
}
