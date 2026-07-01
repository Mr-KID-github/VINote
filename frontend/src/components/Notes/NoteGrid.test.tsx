import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../lib/i18n'
import { NoteGrid } from './NoteGrid'

vi.mock('../../stores/languageStore', () => ({
  useLanguageStore: () => ({
    language: 'zh-CN',
    setLanguage: vi.fn(),
    syncWithAccount: vi.fn(),
  }),
}))

describe('NoteGrid', () => {
  it('shows meeting recording draft and failure statuses in recent notes', () => {
    render(
      <I18nProvider>
        <NoteGrid
          notes={[
            {
              id: 'note-1',
              title: '会议录音',
              content: '错误原因：LLM failed',
              sourceType: 'meeting_recording',
              taskId: 'task-1',
              status: 'generation_failed',
              createdAt: '2026-07-01T10:00:00Z',
              updatedAt: '2026-07-01T10:01:00Z',
            },
          ]}
          emptyTitle="empty"
          emptyBody="empty"
          onOpen={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(screen.getByText('会议录音')).toBeInTheDocument()
    expect(screen.getByText('生成失败')).toBeInTheDocument()
    expect(screen.getByText(/错误原因/)).toBeInTheDocument()
  })
})
