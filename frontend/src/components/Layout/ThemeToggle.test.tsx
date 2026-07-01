import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

const themeStoreMock = vi.hoisted(() => ({
  state: {
    theme: 'dark' as 'light' | 'dark' | 'system',
    resolvedTheme: 'dark' as 'light' | 'dark',
    setTheme: vi.fn(),
  },
}))

vi.mock('../../stores/themeStore', () => ({
  useThemeStore: () => themeStoreMock.state,
}))

vi.mock('../../lib/i18n', () => ({
  useI18n: () => ({
    copy: {
      theme: {
        light: 'Light',
        dark: 'Dark',
        system: 'System',
        toggleTitle: (label: string) => `Theme: ${label}`,
      },
    },
  }),
}))

describe('ThemeToggle', () => {
  it('toggles the header shortcut directly between light and dark instead of cycling to system', async () => {
    themeStoreMock.state.theme = 'dark'
    themeStoreMock.state.resolvedTheme = 'dark'
    themeStoreMock.state.setTheme = vi.fn()

    render(<ThemeToggle />)

    await userEvent.click(screen.getByRole('button', { name: 'Theme: Dark' }))

    expect(themeStoreMock.state.setTheme).toHaveBeenCalledWith('light')
    expect(themeStoreMock.state.setTheme).not.toHaveBeenCalledWith('system')
  })

  it('uses the resolved system theme to choose the next explicit light/dark mode', async () => {
    themeStoreMock.state.theme = 'system'
    themeStoreMock.state.resolvedTheme = 'light'
    themeStoreMock.state.setTheme = vi.fn()

    render(<ThemeToggle />)

    await userEvent.click(screen.getByRole('button', { name: 'Theme: System' }))

    expect(themeStoreMock.state.setTheme).toHaveBeenCalledWith('dark')
  })
})
