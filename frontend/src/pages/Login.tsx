import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { AppFooter } from '../components/Layout/AppFooter'
import { useI18n } from '../lib/i18n'
import { useAuthStore } from '../stores/authStore'

const brandMarkUrl = `${import.meta.env.BASE_URL}vinote-mark.svg`

export function Login() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { signIn, signUp } = useAuthStore()
  const { copy } = useI18n()
  const navigate = useNavigate()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    if (isLogin) {
      const { error: signInError } = await signIn(email, password)

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }

      setLoading(false)
      navigate('/')
      return
    }

    const { error: signUpError, user } = await signUp(email, password)

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    setLoading(false)

    if (user) {
      navigate('/')
      return
    }

    setError(copy.login.accountCreated)
    setIsLogin(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#191919] p-4 pb-24">
      <AppFooter />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={brandMarkUrl} alt="" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">VINote</h1>
          <p className="text-gray-600 dark:text-gray-400">{copy.login.subtitle}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-gray-900 shadow-lg dark:border-[#2f2f2f] dark:bg-[#202020] dark:text-gray-100 dark:shadow-black/20">
          <h2 className="mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100">{isLogin ? copy.login.signIn : copy.login.signUp}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {copy.login.email}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary-light dark:border-gray-700 dark:bg-[#191919] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-primary-dark"
                  placeholder={copy.login.emailPlaceholder}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {copy.login.password}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-12 text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary-light dark:border-gray-700 dark:bg-[#191919] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-primary-dark"
                  placeholder={copy.login.passwordPlaceholder}
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

            {error ? <p className="text-sm text-red-500 dark:text-red-300">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-primary-light dark:bg-primary-dark text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? copy.login.working : isLogin ? copy.login.signIn : copy.login.signUp}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            {isLogin ? copy.login.noAccount : copy.login.hasAccount}
            <button
              onClick={() => {
                setIsLogin(!isLogin)
                setError('')
              }}
              className="ml-1 text-primary-light dark:text-primary-dark hover:underline"
            >
              {isLogin ? copy.login.createAccount : copy.login.backToSignIn}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
