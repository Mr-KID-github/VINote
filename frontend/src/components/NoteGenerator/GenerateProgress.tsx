import clsx from 'clsx'
import { CheckCircle, FileAudio, FileText, Loader2, Mic, XCircle } from 'lucide-react'
import { useI18n } from '../../lib/i18n'

interface GenerateProgressProps {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'failed'
  progress: number
  currentStep: string
  error?: string
  sourceType?: 'audio' | 'transcript'
}

export function GenerateProgress({ status, progress, currentStep, error, sourceType = 'audio' }: GenerateProgressProps) {
  const { copy } = useI18n()
  const steps = [
    { key: 'uploading', label: copy.progress.prepareRequest, icon: FileAudio },
    ...(sourceType === 'audio' ? [{ key: 'transcribing', label: copy.progress.transcribeAudio, icon: Mic }] : []),
    { key: 'summarizing', label: copy.progress.generateNote, icon: FileText },
  ]
  const stepLabels = Object.fromEntries(steps.map((step) => [step.key, step.label]))

  const getStepStatus = (stepKey: string) => {
    if (status === 'success') return 'completed'
    const currentIndex = steps.findIndex((step) => step.key === currentStep)
    const stepIndex = steps.findIndex((step) => step.key === stepKey)
    if (stepIndex < currentIndex) return 'completed'
    if (status === 'failed' && stepIndex === currentIndex) return 'failed'
    if (stepIndex === currentIndex) return status === 'processing' ? 'processing' : 'pending'
    return 'pending'
  }

  if (status === 'idle') return null

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>
            {status === 'success'
              ? copy.progress.completed
              : status === 'failed'
                ? copy.progress.failed
                : stepLabels[currentStep] || copy.progress.preparing}
          </span>
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

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
