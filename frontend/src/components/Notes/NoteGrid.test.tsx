import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../lib/i18n'
import { useMeetingRecorderStore } from '../../stores/meetingRecorderStore'
import { NoteGrid } from './NoteGrid'

describe('NoteGrid live recording card', () => {
  beforeEach(() => {
    useMeetingRecorderStore.getState().resetSession()
  })

  it('shows a transient recording card only while recording and opens its detail', async () => {
    const onOpenLiveRecording = vi.fn()
    const store = useMeetingRecorderStore.getState()
    store.setRecordingStartedAt('2026-07-13T04:00:00.000Z')
    store.setLiveTranscript({
      connection: 'ready',
      mode: 'native_streaming',
      asrText: 'Current live words',
      speakerTurns: [],
      liveSpeakerTurns: true,
    })
    store.setPhase('recording')

    const { rerender } = render(
      <I18nProvider>
        <NoteGrid
          notes={[]}
          emptyTitle="No notes"
          emptyBody="No notes yet"
          onOpen={vi.fn()}
          onOpenLiveRecording={onOpenLiveRecording}
        />
      </I18nProvider>,
    )

    expect(screen.getByTestId('live-recording-card')).toHaveTextContent('Current live words')
    await userEvent.click(screen.getByTestId('live-recording-card'))
    expect(onOpenLiveRecording).toHaveBeenCalledTimes(1)

    act(() => useMeetingRecorderStore.getState().setPhase('stopping'))
    rerender(
      <I18nProvider>
        <NoteGrid
          notes={[]}
          emptyTitle="No notes"
          emptyBody="No notes yet"
          onOpen={vi.fn()}
          onOpenLiveRecording={onOpenLiveRecording}
        />
      </I18nProvider>,
    )
    expect(screen.queryByTestId('live-recording-card')).not.toBeInTheDocument()
    expect(screen.getByText('No notes')).toBeInTheDocument()
  })
})
