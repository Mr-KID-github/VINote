import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { CheckCircle, Download, FileAudio, FileText, Image, Loader2, Mic, XCircle } from 'lucide-react'
import { useI18n } from '../../lib/i18n'

interface GenerateProgressProps {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'failed'
  progress: number
  currentStep: string
  error?: string
  message?: string
}

export function GenerateProgress({ status, progress, currentStep, error, message }: GenerateProgressProps) {
  const { copy } = useI18n()
  const steps = [
    { key: 'uploading', label: copy.progress.prepareRequest, icon: FileAudio },
    { key: 'downloading', label: copy.progress.downloadAudio, icon: Download },
    { key: 'transcribing', label: copy.progress.transcribeAudio, icon: Mic },
    { key: 'summarizing', label: copy.progress.generateNote, icon: FileText },
    { key: 'screenshots', label: copy.progress.processScreenshots, icon: Image },
  ]
  const stepLabels = Object.fromEntries(steps.map((step) => [step.key, step.label]))
  const activeStep = Math.max(1, steps.findIndex(step => step.key === currentStep) + 1)
  const running = status === 'processing' || status === 'uploading'
  const [waitingSeconds, setWaitingSeconds] = useState(0)
  useEffect(() => {
    setWaitingSeconds(0)
    if (!running) return
    const started = Date.now()
    const timer = setInterval(() => setWaitingSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [running, currentStep])
  const detail = message?.replace(/Transcribing chunk (\d+)\/(\d+)/, '正在转写第 $1/$2 段')
    .replace('Transcribing audio...', '正在识别音频内容…')

  const getStepStatus = (stepKey: string) => {
    if (status === 'success') return 'completed'
    const currentIndex = steps.findIndex((step) => step.key === currentStep)
    const stepIndex = steps.findIndex((step) => step.key === stepKey)
    if (stepIndex < currentIndex) return 'completed'
    if (stepIndex === currentIndex) return status === 'failed' ? 'failed' : 'processing'
    return 'pending'
  }

  if (status === 'idle') return null

  return (
    <div className="space-y-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900 dark:bg-blue-950/20 sm:p-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {running && <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary-light motion-reduce:animate-none" />}
            {status === 'success'
              ? copy.progress.completed
              : status === 'failed'
                ? copy.progress.failed
                : stepLabels[currentStep] || copy.progress.preparing}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-blue-700 dark:bg-gray-900 dark:text-blue-300">{status === 'success' ? '已完成' : `第 ${activeStep} / ${steps.length} 步`}</span>
        </div>
        <div className="h-4 rounded-full bg-blue-100 ring-1 ring-inset ring-blue-200 overflow-hidden dark:bg-gray-800 dark:ring-gray-700">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-300',
              status === 'failed' ? 'bg-red-500' : 'bg-primary-light dark:bg-primary-dark'
            )}
            role="progressbar"
            aria-label="生成笔记阶段进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {running && detail && <div role="status" className="rounded-xl bg-white p-4 dark:bg-gray-900">
        <p className="font-medium text-gray-800 dark:text-gray-200">{detail}</p>
        <p className="mt-2 text-sm tabular-nums text-blue-700 dark:text-blue-300">本界面等待 {Math.floor(waitingSeconds / 60)} 分 {waitingSeconds % 60} 秒 · {message?.includes('无法获取') ? '状态检查异常，正在重试' : '等待服务端返回结果'}</p>
        {currentStep === 'transcribing' && <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">音频转写中，完成当前分段后更新进度。进度条表示处理阶段，不代表已转写的音频比例。</p>}
      </div>}

      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((step) => {
          const stepStatus = getStepStatus(step.key)
          const Icon = step.icon

          return (
            <div
              key={step.key}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-lg border',
                stepStatus === 'processing' ? 'border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-950' : 'border-transparent'
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

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
