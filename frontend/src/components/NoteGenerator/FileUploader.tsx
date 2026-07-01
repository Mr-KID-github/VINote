import { useCallback, useEffect, useState } from 'react'
import { FileAudio, FileText, Link as LinkIcon, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { useI18n } from '../../lib/i18n'

export type UploadMode = 'url' | 'file' | 'transcript'

interface FileUploaderProps {
  onVideoUrlChange: (url: string) => void
  onFileSelect: (file: File | null) => void
  onModeChange: (mode: UploadMode) => void
  videoUrl: string
  fileUploadEnabled?: boolean
}

export function FileUploader({
  onVideoUrlChange,
  onFileSelect,
  onModeChange,
  videoUrl,
  fileUploadEnabled = true,
}: FileUploaderProps) {
  const { copy } = useI18n()
  const [mode, setMode] = useState<UploadMode>('url')
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const setModeSafe = (nextMode: UploadMode) => {
    if (!fileUploadEnabled && nextMode !== 'url') {
      return
    }
    if (selectedFile) {
      setSelectedFile(null)
      onFileSelect(null)
    }
    setMode(nextMode)
    onModeChange(nextMode)
  }

  useEffect(() => {
    if (!fileUploadEnabled && mode !== 'url') {
      setModeSafe('url')
    }
  }, [fileUploadEnabled, mode])

  const handleDrag = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true)
    } else if (event.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)

    const files = event.dataTransfer.files
    if (files && files[0]) {
      setSelectedFile(files[0])
      onFileSelect(files[0])
    }
  }, [onFileSelect])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files[0]) {
      setSelectedFile(files[0])
      onFileSelect(files[0])
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setModeSafe('url')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'url'
              ? 'bg-primary-light dark:bg-primary-dark text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          )}
        >
          <LinkIcon className="w-4 h-4" />
          {copy.fileUploader.videoUrl}
        </button>
        {fileUploadEnabled ? (
          <>
            <button
              onClick={() => setModeSafe('file')}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                mode === 'file'
                  ? 'bg-primary-light dark:bg-primary-dark text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              <FileAudio className="w-4 h-4" />
              {copy.fileUploader.localFile}
            </button>
            <button
              onClick={() => setModeSafe('transcript')}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                mode === 'transcript'
                  ? 'bg-primary-light dark:bg-primary-dark text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              <FileText className="w-4 h-4" />
              {copy.fileUploader.localTranscript}
            </button>
          </>
        ) : null}
      </div>

      {mode === 'url' ? (
        <div className="space-y-2">
          <input
            type="text"
            value={videoUrl}
            onChange={(event) => onVideoUrlChange(event.target.value)}
            placeholder={copy.fileUploader.videoPlaceholder}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#191919] focus:ring-2 focus:ring-primary-light dark:focus:ring-primary-dark focus:border-transparent outline-none transition-all"
          />
          {!fileUploadEnabled ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {copy.fileUploader.browserModeHint}
            </p>
          ) : null}
        </div>
      ) : (
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
                onClick={() => {
                  setSelectedFile(null)
                  onFileSelect(null)
                }}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                {mode === 'transcript' ? copy.fileUploader.transcriptDragHint : copy.fileUploader.dragHint}
              </p>
              <p className="text-sm text-gray-400">
                {mode === 'transcript' ? copy.fileUploader.transcriptFormats : copy.fileUploader.formats}
              </p>
              <input
                type="file"
                accept={mode === 'transcript' ? '.txt,.srt,.vtt,.json,.md' : 'audio/*,video/*'}
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="inline-block mt-4 px-4 py-2 bg-primary-light dark:bg-primary-dark text-white rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              >
                {mode === 'transcript' ? copy.fileUploader.selectTranscript : copy.fileUploader.selectFile}
              </label>
            </>
          )}
        </div>
      )}
    </div>
  )
}
