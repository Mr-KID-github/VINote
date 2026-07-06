# VINote 前端实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 创建 React + Vite 前端，支持团队协作笔记管理

**Architecture:** 单页应用 (SPA)，使用 React Router，状态管理用 Zustand，后端对接 Supabase (认证+数据库) 和 VINote API

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind CSS + Supabase + Zustand + React Router + @uiw/react-md-editor

---

## Task 1: 初始化项目

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/.env.example`
- Create: `frontend/.gitignore`

**Step 1: 创建目录和 package.json**

```bash
mkdir -p frontend/src
```

```json
{
  "name": "vinote-frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@supabase/supabase-js": "^2.39.0",
    "zustand": "^4.5.0",
    "@uiw/react-md-editor": "^4.0.4",
    "react-markdown": "^9.0.1",
    "react-syntax-highlighter": "^15.5.0",
    "lucide-react": "^0.330.0",
    "date-fns": "^3.3.0",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "@types/react-syntax-highlighter": "^15.5.11",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.1.0"
  }
}
```

**Step 2: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8900',
        changeOrigin: true,
      },
    },
  },
})
```

**Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: 创建 tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#2383E2',
          dark: '#5B9AF7',
        },
        bg: {
          light: '#FFFFFF',
          'sidebar-light': '#F7F7F5',
          dark: '#191919',
          'sidebar-dark': '#202020',
        },
        text: {
          primary: {
            light: '#37352F',
            dark: '#E3E2E0',
          },
          secondary: '#9B9A97',
        },
        border: {
          light: '#E9E9E7',
          dark: '#2F2F2F',
        },
      },
    },
  },
  plugins: [],
}
```

**Step 6: 创建 postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 7: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VINote - AI 笔记助手</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 8: 创建 src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 9: 创建 src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
}

/* Markdown editor styles */
.w-md-editor {
  @apply !bg-white dark:!bg-[#191919] !border-gray-200 dark:!border-gray-700;
}
```

**Step 10: 创建 src/App.tsx (临时)**

```tsx
function App() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-bold p-4">VINote Frontend</h1>
    </div>
  )
}

export default App
```

**Step 11: 创建 .env.example**

```bash
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_BASE_URL=http://localhost:8900
```

**Step 12: 创建 .gitignore**

```
node_modules/
dist/
.env
.env.local
.DS_Store
*.log
```

**Step 13: 安装依赖并验证**

```bash
cd frontend && npm install
```

预期: 安装成功，无错误

---

## Task 2: 主题系统

**Files:**
- Create: `frontend/src/stores/themeStore.ts`
- Create: `frontend/src/components/Layout/ThemeToggle.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: 创建主题 Store**

```typescript
// src/stores/themeStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: getSystemTheme(),
      setTheme: (theme) => {
        const resolved = theme === 'system' ? getSystemTheme() : theme
        set({ theme, resolvedTheme: resolved })
        document.documentElement.classList.toggle('dark', resolved === 'dark')
      },
    }),
    {
      name: 'vinote-theme',
    }
  )
)
```

**Step 2: 创建 ThemeToggle 组件**

```tsx
// src/components/Layout/ThemeToggle.tsx
import { Moon, Sun, Monitor } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import clsx from 'clsx'

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const icons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  }

  const Icon = icons[theme]

  return (
    <button
      onClick={cycleTheme}
      className={clsx(
        'p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
        'text-gray-600 dark:text-gray-400'
      )}
      title={`当前: ${theme === 'system' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}`}
    >
      <Icon className="w-5 h-5" />
    </button>
  )
}
```

**Step 3: 更新 App.tsx 引入主题**

```tsx
import { useEffect } from 'react'
import { useThemeStore } from './stores/themeStore'
import { ThemeToggle } from './components/Layout/ThemeToggle'

function App() {
  const { resolvedTheme } = useThemeStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  return (
    <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold">VINote</h1>
        <ThemeToggle />
      </header>
    </div>
  )
}

export default App
```

**Step 4: 验证主题切换**

```bash
cd frontend && npm run dev
```

预期: 页面加载后，点击主题切换按钮，背景色在白色和深色间切换

---

## Task 3: 认证模块 (Supabase)

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/stores/authStore.ts`
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/components/Auth/AuthGuard.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`

**Step 1: 创建 Supabase 客户端**

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Step 2: 创建认证 Store**

```typescript
// src/stores/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  initialized: boolean
  initialize: () => Promise<void>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      loading: false,
      initialized: false,
      initialize: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        set({ session, user: session?.user ?? null, initialized: true })

        supabase.auth.onAuthStateChange((_event, session) => {
          set({ session, user: session?.user ?? null })
        })
      },
      signUp: async (email, password) => {
        set({ loading: true })
        const { error } = await supabase.auth.signUp({ email, password })
        set({ loading: false })
        return { error }
      },
      signIn: async (email, password) => {
        set({ loading: true })
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        set({ loading: false })
        return { error }
      },
      signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, session: null })
      },
    }),
    {
      name: 'vinote-auth',
      partialize: (state) => ({ session: state.session }),
    }
  )
)
```

**Step 3: 创建登录页面**

```tsx
// src/pages/Login.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import clsx from 'clsx'

export function Login() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { signIn, signUp } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = isLogin
      ? await signIn(email, password)
      : await signUp(email, password)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      if (!isLogin) {
        setError('注册成功，请登录邮箱验证后使用')
        setIsLogin(true)
      } else {
        navigate('/')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#191919] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">VINote</h1>
          <p className="text-gray-600 dark:text-gray-400">AI 笔记助手，让知识更简单</p>
        </div>

        <div className="bg-white dark:bg-[#202020] rounded-2xl shadow-lg p-8">
          <h2 className="text-xl font-semibold mb-6">{isLogin ? '登录' : '注册'}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] focus:ring-2 focus:ring-primary-light dark:focus:ring-primary-dark focus:border-transparent outline-none transition-all"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] focus:ring-2 focus:ring-primary-light dark:focus:ring-primary-dark focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-primary-light dark:bg-primary-dark text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? '处理中...' : isLogin ? '登录' : '注册'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            {isLogin ? '还没有账号？' : '已有账号？'}
            <button
              onClick={() => { setIsLogin(!isLogin); setError('') }}
              className="ml-1 text-primary-light dark:text-primary-dark hover:underline"
            >
              {isLogin ? '立即注册' : '立即登录'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
```

**Step 4: 创建 AuthGuard 组件**

```tsx
// src/components/Auth/AuthGuard.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore()
  const location = useLocation()

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-light"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
```

**Step 5: 更新 App.tsx 路由**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useEffect } from 'react'
import { Login } from './pages/Login'
import { AuthGuard } from './components/Auth/AuthGuard'
// ... 其他导入

function App() {
  const { initialize, initialized } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [])

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-light"></div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <AuthGuard>
            <Home />
          </AuthGuard>
        } />
      </Routes>
    </BrowserRouter>
  )
}
```

**Step 6: 验证登录流程**

```bash
cd frontend && npm run dev
```

预期:
- 访问 localhost:3000 自动跳转到 /login
- 可以输入邮箱密码注册/登录
- 登录成功后跳转到首页

---

## Task 4: 布局和侧边栏

**Files:**
- Create: `frontend/src/components/Layout/MainLayout.tsx`
- Create: `frontend/src/components/Layout/Sidebar.tsx`
- Create: `frontend/src/components/Layout/Header.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: 创建 MainLayout**

```tsx
// src/components/Layout/MainLayout.tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-white dark:bg-[#191919]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

**Step 2: 创建 Header**

```tsx
// src/components/Layout/Header.tsx
import { Search, Plus, Bell, User } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { useAuthStore } from '../../stores/authStore'

export function Header() {
  const { user } = useAuthStore()

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#202020]">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-primary-light dark:text-primary-dark">VINote</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          type="text"
            placeholder="搜索 <input
           笔记..."
            className="w-64 pl-9 pr-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#191919] focus:ring-2 focus:ring-primary-light dark:focus:ring-primary-dark focus:border-transparent outline-none transition-all"
          />
        </div>

        <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">
          <Bell className="w-5 h-5" />
        </button>

        <ThemeToggle />

        <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          {user?.email ? (
            <div className="w-8 h-8 rounded-full bg-primary-light dark:bg-primary-dark flex items-center justify-center text-white text-sm font-medium">
              {user.email[0].toUpperCase()}
            </div>
          ) : (
            <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>
    </header>
  )
}
```

**Step 3: 创建 Sidebar**

```tsx
// src/components/Layout/Sidebar.tsx
import { useState } from 'react'
import { Folder, FileText, Plus, ChevronRight, ChevronDown, Users, Home, Settings, LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import clsx from 'clsx'

interface FolderItem {
  id: string
  name: string
  children?: FolderItem[]
  notes?: { id: string; title: string }[]
}

export function Sidebar() {
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const { user, signOut } = useAuthStore()

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="w-60 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202020] flex flex-col">
      {/* 快速链接 */}
      <nav className="p-2">
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
          <Home className="w-4 h-4" />
          <span className="text-sm">首页</span>
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
          <FileText className="w-4 h-4" />
          <span className="text-sm">我的笔记</span>
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
          <Users className="w-4 h-4" />
          <span className="text-sm">团队空间</span>
        </button>
      </nav>

      <div className="flex-1 overflow-auto p-2">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">个人空间</span>
          <button className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
            <Plus className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* 文件夹列表 (后续替换为真实数据) */}
        <div className="space-y-0.5">
          {folders.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">暂无文件夹</p>
          ) : (
            folders.map(folder => (
              <FolderItemComponent
                key={folder.id}
                folder={folder}
                expanded={expandedFolders.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* 底部设置 */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700">
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
          <Settings className="w-4 h-4" />
          <span className="text-sm">设置</span>
        </button>
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">退出登录</span>
        </button>
      </div>
    </aside>
  )
}

function FolderItemComponent({ folder, expanded, onToggle }: {
  folder: FolderItem
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Folder className="w-4 h-4 text-yellow-500" />
        <span className="text-sm truncate">{folder.name}</span>
      </button>
      {expanded && folder.children && (
        <div className="ml-4">
          {folder.children.map(child => (
            <FolderItemComponent key={child.id} folder={child} expanded={false} onToggle={() => {}} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 4: 创建 Home 占位页面**

```tsx
// src/pages/Home.tsx
export function Home() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">欢迎使用 VINote</h2>
      <p className="text-gray-600 dark:text-gray-400">选择左侧文件夹或创建新笔记开始</p>
    </div>
  )
}
```

**Step 5: 更新 App.tsx**

```tsx
import { MainLayout } from './components/Layout/MainLayout'
import { Home } from './pages/Home'

// Routes 中添加
<Route element={<MainLayout />}>
  <Route path="/" element={<Home />} />
</Route>
```

**Step 6: 验证布局**

```bash
cd frontend && npm run dev
```

预期: 登录后看到完整的布局（顶部栏+侧边栏+主内容区）

---

## Task 5: 笔记生成页面

**Files:**
- Create: `frontend/src/pages/NoteGenerator.tsx`
- Create: `frontend/src/components/NoteGenerator/FileUploader.tsx`
- Create: `frontend/src/components/NoteGenerator/GenerateProgress.tsx`
- Create: `frontend/src/stores/noteStore.ts`

**Step 1: 创建笔记 Store**

```typescript
// src/stores/noteStore.ts
import { create } from 'zustand'

export type NoteStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'failed'

interface NoteState {
  status: NoteStatus
  progress: number
  currentStep: string
  videoUrl: string
  title: string
  content: string
  error: string

  setStatus: (status: NoteStatus) => void
  setProgress: (progress: number) => void
  setCurrentStep: (step: string) => void
  setVideoUrl: (url: string) => void
  setTitle: (title: string) => void
  setContent: (content: string) => void
  setError: (error: string) => void
  reset: () => void
}

const initialState = {
  status: 'idle' as NoteStatus,
  progress: 0,
  currentStep: '',
  videoUrl: '',
  title: '',
  content: '',
  error: '',
}

export const useNoteStore = create<NoteState>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setCurrentStep: (currentStep) => set({ currentStep }),
  setVideoUrl: (videoUrl) => set({ videoUrl }),
  setTitle: (title) => set({ title }),
  setContent: (content) => set({ content }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}))
```

**Step 2: 创建 FileUploader 组件**

```tsx
// src/components/NoteGenerator/FileUploader.tsx
import { useCallback, useState } from 'react'
import { Upload, Link as LinkIcon, FileAudio, X } from 'lucide-react'
import clsx from 'clsx'

interface FileUploaderProps {
  onVideoUrlChange: (url: string) => void
  onFileSelect: (file: File) => void
  videoUrl: string
}

export function FileUploader({ onVideoUrlChange, onFileSelect, videoUrl }: FileUploaderProps) {
  const [mode, setMode] = useState<'url' | 'file'>('url')
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      setSelectedFile(files[0])
      onFileSelect(files[0])
    }
  }, [onFileSelect])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      setSelectedFile(files[0])
      onFileSelect(files[0])
    }
  }

  return (
    <div className="space-y-4">
      {/* 模式切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('url')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'url'
              ? 'bg-primary-light dark:bg-primary-dark text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          )}
        >
          <LinkIcon className="w-4 h-4" />
          视频链接
        </button>
        <button
          onClick={() => setMode('file')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'file'
              ? 'bg-primary-light dark:bg-primary-dark text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          )}
        >
          <FileAudio className="w-4 h-4" />
          本地文件
        </button>
      </div>

      {/* URL 输入模式 */}
      {mode === 'url' && (
        <div>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => onVideoUrlChange(e.target.value)}
            placeholder="粘贴视频链接 (YouTube/Bilibili/本地文件路径)..."
            className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] focus:ring-2 focus:ring-primary-light dark:focus:ring-primary-dark focus:border-transparent outline-none transition-all"
          />
        </div>
      )}

      {/* 文件上传模式 */}
      {mode === 'file' && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={clsx(
            'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
            dragActive
              ? 'border-primary-light dark:border-primary-dark bg-primary-light/5 dark:bg-primary-dark/5'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
            selectedFile ? 'py-4' : ''
          )}
        >
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileAudio className="w-8 h-8 text-primary-light dark:text-primary-dark" />
              <span className="font-medium">{selectedFile.name}</span>
              <button
                onClick={() => { setSelectedFile(null); onFileSelect(new Blob()) }}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                拖拽文件到此处，或点击选择
              </p>
              <p className="text-sm text-gray-400">
                支持 WAV, MP3, M4A, FLAC, OGG
              </p>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="inline-block mt-4 px-4 py-2 bg-primary-light dark:bg-primary-dark text-white rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              >
                选择文件
              </label>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 3: 创建 GenerateProgress 组件**

```tsx
// src/components/NoteGenerator/GenerateProgress.tsx
import { Loader2, CheckCircle, XCircle, FileAudio, Download, Mic, FileText } from 'lucide-react'
import clsx from 'clsx'

interface GenerateProgressProps {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'failed'
  progress: number
  currentStep: string
  error?: string
}

const steps = [
  { key: 'uploading', label: '上传文件', icon: FileAudio },
  { key: 'downloading', label: '下载视频', icon: Download },
  { key: 'transcribing', label: '转录音频', icon: Mic },
  { key: 'summarizing', label: '生成笔记', icon: FileText },
]

export function GenerateProgress({ status, progress, currentStep, error }: GenerateProgressProps) {
  const getStepStatus = (stepKey: string) => {
    if (status === 'failed') return 'failed'
    const currentIndex = steps.findIndex(s => s.key === currentStep)
    const stepIndex = steps.findIndex(s => s.key === stepKey)
    if (stepIndex < currentIndex) return 'completed'
    if (stepIndex === currentIndex) return status === 'processing' ? 'processing' : 'pending'
    return 'pending'
  }

  if (status === 'idle') return null

  return (
    <div className="space-y-6">
      {/* 进度条 */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>{currentStep || '准备中...'}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full transition-all duration-300',
              status === 'failed' ? 'bg-red-500' : 'bg-primary-light dark:bg-primary-dark'
            )}
            style={{ width: `${status === 'failed' ? 100 : progress}%` }}
          />
        </div>
      </div>

      {/* 步骤列表 */}
      <div className="space-y-3">
        {steps.map((step) => {
          const stepStatus = getStepStatus(step.key)
          const Icon = step.icon

          return (
            <div
              key={step.key}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-lg',
                stepStatus === 'processing' ? 'bg-primary-light/10 dark:bg-primary-dark/10' : ''
              )}
            >
              {stepStatus === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
              {stepStatus === 'processing' && <Loader2 className="w-5 h-5 animate-spin text-primary-light dark:text-primary-dark" />}
              {stepStatus === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
              {stepStatus === 'pending' && <Icon className="w-5 h-5 text-gray-300 dark:text-gray-600" />}

              <span className={clsx(
                'text-sm',
                stepStatus === 'completed' && 'text-green-600 dark:text-green-400',
                stepStatus === 'processing' && 'text-primary-light dark:text-primary-dark font-medium',
                stepStatus === 'failed' && 'text-red-600 dark:text-red-400',
                stepStatus === 'pending' && 'text-gray-400'
              )}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
```

**Step 4: 创建 NoteGenerator 页面**

```tsx
// src/pages/NoteGenerator.tsx
import { useState } from 'react'
import { FileUploader } from '../components/NoteGenerator/FileUploader'
import { GenerateProgress } from '../components/NoteGenerator/GenerateProgress'
import { useNoteStore } from '../stores/noteStore'
import { Wand2 } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8900'

export function NoteGenerator() {
  const [videoUrl, setVideoUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [taskId, setTaskId] = useState('')

  const { status, progress, currentStep, error, setStatus, setProgress, setCurrentStep, setError, reset } = useNoteStore()

  const handleGenerate = async () => {
    if (!videoUrl && !selectedFile) return

    reset()
    setStatus('uploading')
    setCurrentStep('uploading')

    try {
      // 模拟进度更新
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90))
      }, 500)

      if (selectedFile) {
        // 本地文件模式
        const formData = new FormData()
        formData.append('file', selectedFile)

        const response = await fetch(`${API_BASE}/api/generate_from_upload`, {
          method: 'POST',
          body: formData,
        })

        clearInterval(progressInterval)
        setProgress(100)
        setCurrentStep('success')

        if (!response.ok) {
          throw new Error('生成失败')
        }

        const data = await response.json()
        setStatus('success')
      } else {
        // URL 模式 - 先提交任务
        const response = await fetch(`${API_BASE}/api/generate`, {
          method: headers: { 'Content-Type': ' 'POST',
         application/json' },
          body: JSON.stringify({ video_url: videoUrl }),
        })

        const data = await response.json()
        setTaskId(data.task_id)
        setStatus('processing')
        setCurrentStep('transcribing')

        // 轮询任务状态
        pollTaskStatus(data.task_id)
      }
    } catch (err) {
      setStatus('failed')
      setError(err instanceof Error ? err.message : '未知错误')
    }
  }

  const pollTaskStatus = async (id: string) => {
    // 实现轮询逻辑...
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-6">生成笔记</h2>

      <div className="space-y-6">
        <FileUploader
          videoUrl={videoUrl}
          onVideoUrlChange={setVideoUrl}
          onFileSelect={setSelectedFile}
        />

        <button
          onClick={handleGenerate}
          disabled={status !== 'idle' || (!videoUrl && !selectedFile)}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-primary-light dark:bg-primary-dark text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Wand2 className="w-5 h-5" />
          开始生成
        </button>

        <GenerateProgress
          status={status}
          progress={progress}
          currentStep={currentStep}
          error={error}
        />
      </div>
    </div>
  )
}
```

**Step 5: 添加路由**

```tsx
// App.tsx
import { NoteGenerator } from './pages/NoteGenerator'

<Route element={<MainLayout />}>
  <Route path="/" element={<Home />} />
  <Route path="/generate" element={<NoteGenerator />} />
</Route>
```

**Step 6: 验证笔记生成**

```bash
cd frontend && npm run dev
```

预期: 访问 /generate 可以看到上传组件，点击生成按钮开始处理

---

## Task 6: 笔记编辑器 (左右分栏)

**Files:**
- Create: `frontend/src/pages/NoteEditor.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: 创建 NoteEditor 页面**

```tsx
// src/pages/NoteEditor.tsx
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Save, Download, Share2, MoreHorizontal } from 'lucide-react'

interface NoteEditorProps {
  initialContent?: string
}

export function NoteEditor({ initialContent = '' }: NoteEditorProps) {
  const [content, setContent] = useState(initialContent)
  const [isPreview, setIsPreview] = useState(false)

  useEffect(() => {
    if (initialContent) {
      setContent(initialContent)
    }
  }, [initialContent])

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPreview(false)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              !isPreview
                ? 'bg-gray-200 dark:bg-gray-700'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            编辑
          </button>
          <button
            onClick={() => setIsPreview(true)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              isPreview
                ? 'bg-gray-200 dark:bg-gray-700'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            预览
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <Save className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <Download className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <Share2 className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 编辑/预览区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 编辑区 */}
        <div className={`flex-1 ${isPreview ? 'hidden md:block' : ''}`}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full p-4 resize-none outline-none bg-white dark:bg-[#191919] font-mono text-sm"
            placeholder="在这里编写 Markdown..."
          />
        </div>

        {/* 预览区 */}
        <div className={`flex-1 border-l border-gray-200 dark:border-gray-700 overflow-auto p-4 bg-gray-50 dark:bg-[#202020] ${!isPreview ? 'hidden md:block' : ''}`}>
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  return match ? (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  )
                },
              }}
            >
              {content || '*暂无内容*'}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: 添加路由**

```tsx
<Route path="/note/:id" element={<NoteEditor />} />
```

---

## Task 7: 设置页面

**Files:**
- Create: `frontend/src/pages/Settings.tsx`

**Step 1: 创建设置页面**

```tsx
// src/pages/Settings.tsx
import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { User, Shield, Palette, Bell } from 'lucide-react'
import clsx from 'clsx'

type Tab = 'profile' | 'team' | 'appearance' | 'notifications'

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const { user } = useAuthStore()

  const tabs = [
    { key: 'profile', label: '个人资料', icon: User },
    { key: 'team', label: '团队管理', icon: Shield },
    { key: 'appearance', label: '外观', icon: Palette },
    { key: 'notifications', label: '通知', icon: Bell },
  ] as const

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-6">设置</h2>

      <div className="flex gap-8">
        {/* 侧边 tabs */}
        <nav className="w-48 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                activeTab === tab.key
                  ? 'bg-primary-light/10 dark:bg-primary-dark/10 text-primary-light dark:text-primary-dark'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* 内容区 */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">邮箱</label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202020] text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">显示名称</label>
                <input
                  type="text"
                  placeholder="你的名字"
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] focus:ring-2 focus:ring-primary-light dark:focus:ring-primary-dark focus:border-transparent outline-none transition-all"
                />
              </div>
              <button className="px-4 py-2 bg-primary-light dark:bg-primary-dark text-white rounded-lg hover:opacity-90 transition-opacity">
                保存修改
              </button>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="space-y-4">
              <h3 className="font-medium">团队管理</h3>
              <p className="text-gray-500 text-sm">暂无团队</p>
              <button className="px-4 py-2 bg-primary-light dark:bg-primary-dark text-white rounded-lg hover:opacity-90 transition-opacity">
                创建团队
              </button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <h3 className="font-medium">主题设置</h3>
              <div className="space-y-2">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <label key={theme} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="radio" name="theme" value={theme} className="text-primary-light" />
                    <span>{theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <h3 className="font-medium">通知设置</h3>
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="text-primary-light" />
                <span>生成完成通知</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: 添加路由**

```tsx
<Route path="/settings" element={<Settings />} />
```

---

## Task 8: Supabase 数据库初始化

**Files:**
- Create: `frontend/supabase/migrations/001_initial.sql`

**Step 1: 创建数据库迁移脚本**

```sql
-- supabase/migrations/001_initial.sql

-- 团队表
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 团队成员表
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- 文件夹表
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 笔记表
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  video_url TEXT,
  source_type TEXT CHECK (source_type IN ('video', 'file')),
  task_id TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'done', 'failed')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 分享链接表
CREATE TABLE IF NOT EXISTS shared_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  password TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 策略 (后续添加)
```

---

## Task 9: 构建和部署

**Step 1: 构建生产版本**

```bash
cd frontend && npm run build
```

预期: 生成 dist 目录

**Step 2: Vercel 部署**

1. push 代码到 GitHub
2. 在 Vercel 导入项目
3. 配置环境变量:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - VITE_API_BASE_URL
4. Deploy

---

## 总结

本计划包含 9 个 Task，涵盖:
- 项目初始化 + 依赖安装
- 主题系统
- Supabase 认证
- 布局和侧边栏
- 笔记生成页面
- 笔记编辑器
- 设置页面
- 数据库初始化
- 构建部署

建议按顺序执行，每个 Task 作为独立的开发周期。
