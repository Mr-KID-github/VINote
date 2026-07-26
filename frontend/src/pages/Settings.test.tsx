import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { Settings } from './Settings'

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({ initialized: true, user: { id: 'user-1', email: 'user@example.com' } }),
}))

vi.mock('../stores/languageStore', () => ({
  useLanguageStore: () => ({
    language: 'zh-CN',
    setLanguage: vi.fn(),
    syncWithAccount: vi.fn(),
  }),
}))

vi.mock('../stores/themeStore', () => ({
  useThemeStore: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

describe('Settings page layout', () => {
  it('uses the full available main area instead of centering a narrow settings canvas', () => {
    render(
      <I18nProvider>
        <Settings />
      </I18nProvider>
    )

    const page = screen.getByRole('heading', { name: '设置' }).parentElement as HTMLElement

    expect(page.className).toContain('w-full')
    expect(page.className).not.toContain('max-w-[1440px]')
    expect(page.className).not.toContain('mx-auto')
  })
})
