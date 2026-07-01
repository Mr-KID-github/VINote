import { Clock3, ImageIcon } from 'lucide-react'
import type { KeyMoment } from '../../lib/markdownKeyMoments'

interface KeyMomentsRailProps {
  moments: KeyMoment[]
  activeAnchorId?: string
  onSelectMoment: (moment: KeyMoment) => void
}

export function KeyMomentsRail({ moments, activeAnchorId, onSelectMoment }: KeyMomentsRailProps) {
  if (moments.length === 0) {
    return null
  }

  return (
    <aside className="hidden w-[280px] shrink-0 border-r border-gray-200 bg-[#f7f7f4] xl:flex xl:flex-col dark:border-gray-800 dark:bg-[#151515]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">
          Key Moments
        </p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Jump only through the sections worth revisiting.
        </p>
      </div>

      <div className="stealth-scroll flex-1 space-y-3 overflow-y-auto p-4">
        {moments.map((moment) => {
          const active = moment.anchorId === activeAnchorId
          return (
            <button
              key={`${moment.anchorId}-${moment.seconds}`}
              type="button"
              onClick={() => onSelectMoment(moment)}
              className={`w-full rounded-2xl border p-3 text-left transition ${
                active
                  ? 'border-primary-light bg-white shadow-sm dark:border-primary-dark dark:bg-[#1d1d1d]'
                  : 'border-gray-200 bg-white/70 hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-[#1a1a1a] dark:hover:border-gray-700'
              }`}
            >
              {moment.imageUrl ? (
                <img
                  src={moment.imageUrl}
                  alt={moment.title}
                  className="mb-3 aspect-video w-full rounded-xl object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-500">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}

              <div className="flex items-center gap-2 text-xs font-medium text-primary-light dark:text-primary-dark">
                <Clock3 className="h-3.5 w-3.5" />
                {moment.timestampLabel}
              </div>
              <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{moment.title}</h3>
              {moment.excerpt ? (
                <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">{moment.excerpt}</p>
              ) : null}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
