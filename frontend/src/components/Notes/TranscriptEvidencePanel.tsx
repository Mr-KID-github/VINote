import { useEffect, useRef, useState } from 'react'
import { Check, Wand2 as WandSparkles, X } from 'lucide-react'
import {
  findActiveTranscriptSegment,
  formatTranscriptTimestamp,
  transcriptText,
  type TranscriptEvidence,
  type TranscriptTextMode,
} from '../../lib/noteTranscript'

interface TranscriptEvidencePanelProps {
  evidence: TranscriptEvidence | null
  loading: boolean
  currentTimestamp: number
  textMode: TranscriptTextMode
  onTextModeChange: (mode: TranscriptTextMode) => void
  onSeek: (seconds: number) => void
  onSaveAlias: (speakerId: string, label: string) => Promise<void>
}

export function TranscriptEvidencePanel({
  evidence,
  loading,
  currentTimestamp,
  textMode,
  onTextModeChange,
  onSeek,
  onSaveAlias,
}: TranscriptEvidencePanelProps) {
  const turnRefs = useRef<Array<HTMLDivElement | null>>([])
  const lastScrolled = useRef(-1)
  const [editingSpeakerId, setEditingSpeakerId] = useState('')
  const [speakerDraft, setSpeakerDraft] = useState('')
  const [error, setError] = useState('')
  const segments = evidence?.segments ?? []
  const metadata = evidence?.metadata ?? {}
  const activeIndex = findActiveTranscriptSegment(segments, currentTimestamp)
  const hasRawText = segments.some((segment) => Boolean(segment.raw_text && segment.raw_text !== segment.cleaned_text))

  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastScrolled.current) {
      return
    }
    lastScrolled.current = activeIndex
    turnRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  const saveAlias = async () => {
    if (!editingSpeakerId) return
    try {
      await onSaveAlias(editingSpeakerId, speakerDraft.trim())
      setEditingSpeakerId('')
      setSpeakerDraft('')
      setError('')
    } catch {
      setError('Unable to save speaker name')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-primary-light" />
      </div>
    )
  }

  return (
    <section className="stealth-scroll min-h-0 flex-1 overflow-auto bg-[#fcfbf7] px-5 py-5 dark:bg-[#181818]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {evidence?.language ? (
            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs dark:border-gray-700 dark:bg-[#111111]">
              Language · {evidence.language}
            </span>
          ) : null}
          <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs dark:border-gray-700 dark:bg-[#111111]">
            Segments · {segments.length}
          </span>
          {Object.entries(metadata).slice(0, 6).map(([key, value]) => (
            value === null || value === undefined || typeof value === 'object' ? null : (
              <span key={key} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs dark:border-gray-700 dark:bg-[#111111]">
                {key} · {String(value)}
              </span>
            )
          ))}
          {hasRawText ? (
            <button
              type="button"
              onClick={() => onTextModeChange(textMode === 'clean' ? 'raw' : 'clean')}
              aria-label={textMode === 'clean' ? 'Show raw ASR' : 'Show smart cleanup'}
              title={textMode === 'clean' ? 'Show raw ASR' : 'Show smart cleanup'}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                textMode === 'clean'
                  ? 'border-primary-light bg-primary-light text-white dark:border-primary-dark dark:bg-primary-dark'
                  : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-[#111111]'
              }`}
            >
              <WandSparkles className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}

        {segments.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111111]">
            {segments.map((segment, index) => {
              const speakerId = segment.speaker_id || 'speaker_unknown'
              const fallbackLabel = segment.speaker_label || 'Speaker'
              const speakerLabel = evidence?.aliases[speakerId] || fallbackLabel
              const editing = editingSpeakerId === speakerId
              const active = activeIndex === index
              return (
                <div
                  key={`${segment.start}-${speakerId}-${index}`}
                  ref={(node) => {
                    turnRefs.current[index] = node
                  }}
                  className={`grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0 sm:grid-cols-[72px_150px_minmax(0,1fr)] dark:border-gray-800 ${
                    active ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-[#181818]'
                  }`}
                >
                  <button type="button" onClick={() => onSeek(segment.start)} className="text-left text-sm font-medium tabular-nums text-gray-500">
                    {formatTranscriptTimestamp(segment.start)}
                  </button>
                  <div className="min-w-0">
                    {editing ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={speakerDraft}
                          maxLength={80}
                          autoFocus
                          aria-label={`Rename ${speakerId}`}
                          onChange={(event) => setSpeakerDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void saveAlias()
                            if (event.key === 'Escape') setEditingSpeakerId('')
                          }}
                          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-[#181818]"
                        />
                        <button type="button" onClick={() => void saveAlias()} title="Save speaker name" className="rounded-md p-1">
                          <Check className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setEditingSpeakerId('')} title="Cancel speaker name" className="rounded-md p-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Rename ${speakerId}`}
                        onClick={() => {
                          setEditingSpeakerId(speakerId)
                          setSpeakerDraft(evidence?.aliases[speakerId] || fallbackLabel)
                          setError('')
                        }}
                        className="max-w-full truncate rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold dark:bg-gray-800"
                      >
                        {speakerLabel}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSeek(segment.start)}
                    className="col-span-2 min-w-0 text-left text-[15px] leading-6 sm:col-span-1"
                  >
                    {transcriptText(segment, textMode)}
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 px-5 py-12 text-center text-sm text-gray-500 dark:border-gray-700">
            Transcript unavailable
          </div>
        )}
      </div>
    </section>
  )
}
