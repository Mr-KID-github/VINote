import { useEffect, useRef, useState } from 'react'
import { ExternalLink, PlayCircle } from 'lucide-react'
import { buildVideoJumpUrl, formatTimestampLabel, resolveContentUrl } from '../../lib/videoLinks'

interface VideoReferencePanelProps {
  noteId?: string
  taskId?: string
  videoUrl: string
  currentTimestamp: number
  jumpRequestId?: number
  activeMomentTitle?: string
  className?: string
  onTimestampChange?: (seconds: number) => void
}

type PlayerKind = 'video' | 'audio'

export function VideoReferencePanel({
  noteId,
  taskId,
  videoUrl,
  currentTimestamp,
  jumpRequestId = 0,
  activeMomentTitle,
  className,
  onTimestampChange,
}: VideoReferencePanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playerKind, setPlayerKind] = useState<PlayerKind>('video')
  const localMediaUrl = noteId && taskId ? resolveContentUrl(`/api/notes/${noteId}/media`) : null
  const jumpUrl = buildVideoJumpUrl(localMediaUrl || videoUrl, currentTimestamp)
  const timestampLabel = formatTimestampLabel(currentTimestamp)

  useEffect(() => {
    if (!localMediaUrl) {
      setPlayerKind('video')
      return
    }

    let cancelled = false
    setPlayerKind('video')

    void fetch(localMediaUrl, { method: 'HEAD', credentials: 'include' })
      .then((response) => {
        if (!response.ok || cancelled) {
          return
        }

        const contentType = response.headers.get('content-type') || ''
        if (contentType.startsWith('audio/')) {
          setPlayerKind('audio')
        } else if (contentType.startsWith('video/')) {
          setPlayerKind('video')
        }
      })
      .catch(() => {
        // Keep the video element as the optimistic default.
      })

    return () => {
      cancelled = true
    }
  }, [localMediaUrl])

  useEffect(() => {
    const player = playerKind === 'video' ? videoRef.current : audioRef.current
    if (!player || !localMediaUrl || jumpRequestId === 0) {
      return
    }

    player.currentTime = currentTimestamp
    if (currentTimestamp > 0) {
      void player.play().catch(() => {
        // Keep the seek even if autoplay is blocked.
      })
    }
  }, [currentTimestamp, jumpRequestId, localMediaUrl, playerKind])

  return (
    <aside className={className}>
      <div className="space-y-3 xl:sticky xl:top-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            Source Media
          </p>
          <h3 className="mt-1 text-base font-semibold">Jump from note to local source context</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Current position: {timestampLabel}
          </p>
          {activeMomentTitle ? (
            <p className="mt-2 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:bg-[#222222] dark:text-gray-200">
              Active focus: {activeMomentTitle}
            </p>
          ) : null}
        </div>

        {localMediaUrl ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-[#111111]">
            {playerKind === 'video' ? (
              <video
                ref={videoRef}
                controls
                preload="metadata"
                src={localMediaUrl}
                className="aspect-video w-full rounded-xl bg-black"
                onError={() => setPlayerKind('audio')}
                onTimeUpdate={(event) => {
                  onTimestampChange?.(Math.floor(event.currentTarget.currentTime))
                }}
              />
            ) : (
              <audio
                ref={audioRef}
                controls
                preload="metadata"
                src={localMediaUrl}
                className="w-full"
                onTimeUpdate={(event) => {
                  onTimestampChange?.(Math.floor(event.currentTarget.currentTime))
                }}
              />
            )}
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Timestamp links now seek the downloaded local media instead of reopening the original page.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Local media is unavailable for this note, so only the original source link can be opened.
          </div>
        )}

        <a
          href={jumpUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-light px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:bg-primary-dark"
        >
          <PlayCircle className="h-4 w-4" />
          Open at {timestampLabel}
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </aside>
  )
}
