import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Server, Wand2 } from 'lucide-react'
import { FileUploader, type UploadMode } from '../components/NoteGenerator/FileUploader'
import { GenerateProgress } from '../components/NoteGenerator/GenerateProgress'
import { useI18n } from '../lib/i18n'
import { apiJson } from '../lib/api'
import {
  progressForGenerationStep,
  taskGenerationStep,
  type TaskStatusResponse,
} from '../lib/noteGenerationClient'
import { useNoteGenerationStore } from '../stores/noteGenerationStore'
import { getWorkspaceLabel, useTeamStore } from '../stores/teamStore'
import { describeMissingModels, useVILabServerStore } from '../stores/vilabServerStore'

type TaskResponse = { task_id: string }
type SummaryMode = 'default' | 'accurate' | 'oneshot'
export function NoteGenerator() {
  const [videoUrl, setVideoUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadMode, setUploadMode] = useState<UploadMode>('file')
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('default')
  const [, setTaskId] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { copy, language } = useI18n()

  const {
    status,
    progress,
    currentStep,
    error,
    setStatus,
    setProgress,
    setCurrentStep,
    setError,
    reset,
  } = useNoteGenerationStore()
  const { currentWorkspace, teams, loadTeams } = useTeamStore()
  const { connection, readiness, loadConnection } = useVILabServerStore()
  const navigate = useNavigate()

  useEffect(() => {
    void loadConnection()
    void loadTeams()
  }, [loadConnection, loadTeams])

  useEffect(() => {
    reset()

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      reset()
    }
  }, [reset])

  const pollTaskStatus = (
    id: string,
  ) => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await apiJson<TaskStatusResponse>(`/api/task/${id}`)
        const reportedStep = taskGenerationStep(data)

        if (data.status === 'success') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setProgress(100)
          setCurrentStep('success')
          setStatus('success')

          if (data.note_id) {
            navigate(`/note/${data.note_id}`)
            return
          }

          setStatus('failed')
          setError(copy.generator.saveFailed)
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          if (reportedStep) {
            setCurrentStep(reportedStep)
            setProgress(progressForGenerationStep(reportedStep))
          }
          setStatus('failed')
          setError(data.message || 'Generation failed')
        } else if (reportedStep) {
          setCurrentStep(reportedStep)
          setProgress(progressForGenerationStep(reportedStep))
        }
      } catch (pollError) {
        console.error('Failed to poll task status:', pollError)
      }
    }, 2000)
  }

  const handleGenerate = async () => {
    if (!connection || connection.status !== 'connected') {
      setError('Connect a VILab Server before generating.')
      return
    }

    if (uploadMode === 'url') {
      setError('URL and video support is not available yet. Upload audio or a transcript.')
      return
    }

    const pipelineReadiness = uploadMode === 'transcript' ? readiness?.transcriptNote : readiness?.audioMeeting
    if (pipelineReadiness?.ready !== true) {
      setError(`VILab Server is connected but not ready. Missing ready models: ${describeMissingModels(pipelineReadiness)}.`)
      return
    }

    if (!selectedFile) {
      return
    }

    if (uploadMode === 'file' && (selectedFile.type.startsWith('video/') || /\.(mp4|mkv|mov|avi|m4v|webm)$/i.test(selectedFile.name))) {
      setError('Video uploads are not available yet. Upload an audio file.')
      return
    }

    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    reset()
    setStatus('uploading')
    setCurrentStep('uploading')
    setProgress(10)

    try {
      const generationWorkspace = currentWorkspace
      if (!selectedFile) {
        throw new Error(copy.generator.fileRequired)
      }

      const formData = new FormData()
      const sourceType = uploadMode === 'transcript' ? 'transcript' : 'audio'

      formData.append('file', selectedFile)
      formData.append('source_type', sourceType)
      formData.append('title', selectedFile.name)
      formData.append('summary_mode', summaryMode)
      formData.append('output_language', language)
      formData.append('scope', generationWorkspace.scope)
      if (generationWorkspace.scope === 'team') {
        formData.append('team_id', generationWorkspace.teamId)
      }

      const data = await apiJson<TaskResponse>('/api/generate_from_upload', {
        method: 'POST',
        body: formData,
      })

      setTaskId(data.task_id)
      setStatus('processing')
      const submittedStep = sourceType === 'transcript' ? 'summarizing' : 'transcribing'
      setCurrentStep(submittedStep)
      setProgress(progressForGenerationStep(submittedStep))
      pollTaskStatus(data.task_id)
    } catch (generationError) {
      setStatus('failed')
      setError(generationError instanceof Error ? generationError.message : copy.generator.unknownError)
    }
  }

  const handleEditInput = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    reset()
  }

  const workspaceLabel = getWorkspaceLabel(
    currentWorkspace,
    teams,
    copy.sidebar.home,
  )
  const summaryModeOptions: Array<{ value: SummaryMode; label: string; description: string }> = [
    {
      value: 'default' as SummaryMode,
      label: copy.generator.summaryModeDefaultLabel,
      description: copy.generator.summaryModeDefaultDesc,
    },
    {
      value: 'accurate' as SummaryMode,
      label: copy.generator.summaryModeAccurateLabel,
      description: copy.generator.summaryModeAccurateDesc,
    },
    {
      value: 'oneshot' as SummaryMode,
      label: copy.generator.summaryModeOneshotLabel,
      description: copy.generator.summaryModeOneshotDesc,
    },
  ]
  const selectedSummaryMode = summaryModeOptions.find((option) => option.value === summaryMode)
  const vilabConnected = connection?.status === 'connected'
  const selectedPipelineReadiness = uploadMode === 'transcript' ? readiness?.transcriptNote : readiness?.audioMeeting
  const selectedPipelineReady = selectedPipelineReadiness?.ready === true

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold">{copy.generator.title}</h2>
      </div>

      <div className="space-y-6">
        <FileUploader
          videoUrl={videoUrl}
          onVideoUrlChange={setVideoUrl}
          onFileSelect={setSelectedFile}
          onModeChange={setUploadMode}
          fileUploadEnabled={true}
          urlEnabled={false}
          initialMode="file"
        />

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#202020]">
          <label className="block text-sm font-medium mb-2">
            {copy.generator.saveTargetWorkspace}
          </label>
          <p className="text-sm text-gray-600 dark:text-gray-300">{workspaceLabel}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {copy.generator.saveTargetWorkspaceHint}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#202020]">
          <div className="flex items-start gap-3">
            <Server className={vilabConnected && selectedPipelineReady ? 'mt-0.5 h-5 w-5 text-emerald-600' : 'mt-0.5 h-5 w-5 text-amber-600'} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {vilabConnected && selectedPipelineReady
                  ? 'Using ready VILab Server pipeline'
                  : vilabConnected
                    ? 'VILab Server connected, pipeline not ready'
                    : 'Connect a VILab Server before generating'}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {vilabConnected && selectedPipelineReady
                  ? `${connection?.base_url || 'VILab Server'} handles ASR, diarization, LLM, and artifacts.`
                  : vilabConnected
                    ? `Missing ready models: ${describeMissingModels(selectedPipelineReadiness)}. Configure models in VILab Server Admin.`
                    : 'Open Settings > Models to connect VINote to a local or remote VILab Server.'}
              </p>
              {!vilabConnected && (
                <button type="button" onClick={() => navigate('/settings')} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">
                  Go to Settings &gt; Models
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#202020]">
          <label className="block text-sm font-medium mb-2">
            {copy.generator.summaryMode}
          </label>
          <select
            value={summaryMode}
            onChange={(event) => setSummaryMode(event.target.value as SummaryMode)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] outline-none focus:ring-2 focus:ring-primary-light"
          >
            {summaryModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {selectedSummaryMode?.description}
          </p>
        </div>

        <button
          onClick={() => void handleGenerate()}
          disabled={!vilabConnected || !selectedPipelineReady || status !== 'idle' || !selectedFile}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-primary-light dark:bg-primary-dark text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Wand2 className="w-5 h-5" />
          {status === 'idle' ? copy.generator.start : copy.generator.generating}
        </button>

        {status === 'failed' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {copy.generator.failedRecoveryHint}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={!selectedPipelineReady || !selectedFile}
                className="flex-1 rounded-lg bg-primary-light px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-primary-dark"
              >
                {copy.generator.retryGeneration}
              </button>
              <button
                type="button"
                onClick={handleEditInput}
                className="flex-1 rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-900/40"
              >
                {copy.generator.editInput}
              </button>
            </div>
          </div>
        ) : null}

        <GenerateProgress
          status={status}
          progress={progress}
          currentStep={currentStep}
          error={error}
          sourceType={uploadMode === 'transcript' ? 'transcript' : 'audio'}
        />
      </div>
    </div>
  )
}
