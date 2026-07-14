import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '../lib/i18n'
import { useMeetingRecorderStore } from '../stores/meetingRecorderStore'
import { LiveRecordingDetail } from './LiveRecordingDetail'

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/recording/live?view=transcript']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/recording/live" element={<I18nProvider><LiveRecordingDetail /></I18nProvider>} />
        <Route path="/note/:id" element={<div>Final transcript</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LiveRecordingDetail', () => {
  beforeEach(() => {
    useMeetingRecorderStore.getState().resetSession()
  })

  it('renders streamed turns only while recording', async () => {
    const store = useMeetingRecorderStore.getState()
    store.setRecordingStartedAt('2026-07-13T04:00:00.000Z')
    store.setLiveTranscript({
      connection: 'ready',
      mode: 'native_streaming',
      asrText: 'Current raw text',
      speakerTurns: [{
        turnId: 'turn-1',
        speakerId: 'speaker_01',
        startMs: 1200,
        text: 'Current speaker turn',
      }],
      liveSpeakerTurns: true,
    })
    store.setPhase('recording')

    renderDetail()

    expect(screen.getByText('Current speaker turn')).toBeInTheDocument()
    expect(screen.getByText('speaker_01')).toBeInTheDocument()
    expect(screen.getByText('native_streaming')).toBeInTheDocument()

    act(() => useMeetingRecorderStore.getState().setPhase('stopping'))
    await waitFor(() => expect(screen.queryByText('Current speaker turn')).not.toBeInTheDocument())
  })

  it('replaces the live detail with the finalized transcript route', async () => {
    useMeetingRecorderStore.getState().setPhase('recording')
    renderDetail()

    act(() => useMeetingRecorderStore.getState().complete('note-1'))

    expect(await screen.findByText('Final transcript')).toBeInTheDocument()
  })
})
