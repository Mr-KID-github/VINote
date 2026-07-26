import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../lib/i18n'
import type { NoteRecord } from '../../stores/noteLibraryStore'
import { NoteGrid } from './NoteGrid'

vi.mock('../../stores/languageStore', () => ({
  useLanguageStore: () => ({
    language: 'zh-CN',
    setLanguage: vi.fn(),
    syncWithAccount: vi.fn(),
  }),
}))

const teamNote: NoteRecord = {
  id: 'team-note-1',
  title: '团队会议纪要',
  content: '讨论内容',
  status: 'done',
  scope: 'team',
  teamId: 'team-1',
  teamName: '产品团队',
  createdAt: '2026-07-26T00:00:00Z',
  updatedAt: '2026-07-26T00:00:00Z',
}

describe('NoteGrid', () => {
  it('keeps the workspace badge visible for team notes', () => {
    render(
      <I18nProvider>
        <NoteGrid
          notes={[teamNote]}
          emptyTitle="暂无笔记"
          emptyBody="创建第一条笔记"
          onOpen={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(screen.getByText('产品团队')).toBeInTheDocument()
  })
})
