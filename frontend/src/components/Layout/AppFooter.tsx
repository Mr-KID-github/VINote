import clsx from 'clsx'
import { BookText, Github } from 'lucide-react'
import packageJson from '../../../package.json'
import { resolveDocumentUrl } from '../../lib/runtimeConfig'

const githubUrl = 'https://github.com/Mr-KID-github/VideoNote'

type AppFooterPlacement = 'floating' | 'sidebar'

interface AppFooterProps {
  placement?: AppFooterPlacement
  collapsed?: boolean
}

export function AppFooter({ placement = 'floating', collapsed = false }: AppFooterProps) {
  const docsUrl = resolveDocumentUrl()
  const wrapperClassName = placement === 'sidebar'
    ? 'absolute inset-x-0 bottom-0 z-10 border-t border-gray-200/80 bg-gray-50/97 px-3 py-3 backdrop-blur dark:border-gray-700/80 dark:bg-[#202020]/97'
    : 'pointer-events-none fixed bottom-4 left-1/2 z-50 w-full max-w-[calc(100vw-2rem)] -translate-x-1/2 px-4'
  const cardClassName = placement === 'sidebar'
    ? clsx('space-y-2', collapsed ? 'flex flex-col items-center' : '')
    : 'pointer-events-auto mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-gray-200/80 bg-white/85 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur dark:border-gray-700/70 dark:bg-[#1d1d1d]/90 dark:shadow-black/20'
  const versionClassName = placement === 'sidebar'
    ? clsx(
        'inline-flex rounded-full bg-white/92 px-2 py-1 text-[11px] font-medium tracking-[0.02em] text-gray-500 ring-1 ring-gray-200/80 dark:bg-[#262626] dark:text-gray-300 dark:ring-gray-700/80',
        collapsed ? 'justify-center self-center' : ''
      )
    : 'rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-300'
  const linkGroupClassName = placement === 'sidebar'
    ? clsx('flex flex-col items-start gap-0.5', collapsed ? 'items-center' : '')
    : 'flex flex-wrap items-center gap-2'
  const linkClassName = placement === 'sidebar'
    ? clsx(
        'inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-white/90 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-[#262626] dark:hover:text-gray-100',
        collapsed ? 'w-full justify-center px-0' : ''
      )
    : 'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-primary-light dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-primary-dark'

  return (
    <div className={wrapperClassName}>
      <div className={cardClassName}>
        <span className={versionClassName}>v{packageJson.version}</span>

        <div className={linkGroupClassName}>
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClassName}
            aria-label="Open documentation"
            title="Document"
          >
            <BookText className="h-4 w-4" />
            {collapsed ? null : <span>Document</span>}
          </a>

          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClassName}
            aria-label="Open GitHub repository"
            title="GitHub"
          >
            <Github className="h-4 w-4" />
            {collapsed ? null : <span>GitHub</span>}
          </a>
        </div>
      </div>
    </div>
  )
}
