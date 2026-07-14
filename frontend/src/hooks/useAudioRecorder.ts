import { useCallback, useEffect, useRef, useState } from 'react'
import { requestDesktopMicrophoneAccess } from '../lib/desktopMicrophonePermission'

type AudioRecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'failed'

const MIME_TYPE_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

const STOP_FALLBACK_MS = 3000

export function getPreferredAudioMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  return MIME_TYPE_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || ''
}

export function useAudioRecorder(
  onPcmFrame?: (samples: Float32Array, sampleRate: number) => void,
  onPcmError?: (message: string) => void,
) {
  const [status, setStatus] = useState<AudioRecorderStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const timerStartedAtRef = useRef(0)
  const accumulatedMsRef = useRef(0)
  const mimeTypeRef = useRef('')
  const pcmFrameCallbackRef = useRef(onPcmFrame)
  const pcmErrorCallbackRef = useRef(onPcmError)
  const audioContextRef = useRef<AudioContext | null>(null)
  const pcmSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const pcmNodeRef = useRef<AudioNode | null>(null)

  useEffect(() => {
    pcmFrameCallbackRef.current = onPcmFrame
    pcmErrorCallbackRef.current = onPcmError
  }, [onPcmError, onPcmFrame])

  const isSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const captureElapsed = useCallback(() => {
    if (timerStartedAtRef.current) {
      accumulatedMsRef.current += Date.now() - timerStartedAtRef.current
      timerStartedAtRef.current = 0
    }
    setElapsedSeconds(Math.floor(accumulatedMsRef.current / 1000))
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerStartedAtRef.current = Date.now()
    timerRef.current = window.setInterval(() => {
      const elapsedMs = accumulatedMsRef.current + Date.now() - timerStartedAtRef.current
      setElapsedSeconds(Math.floor(elapsedMs / 1000))
    }, 500)
  }, [clearTimer])

  const cleanupPcm = useCallback(() => {
    if (typeof AudioWorkletNode !== 'undefined' && pcmNodeRef.current instanceof AudioWorkletNode) {
      pcmNodeRef.current.port.onmessage = null
    }
    pcmNodeRef.current?.disconnect()
    pcmSourceRef.current?.disconnect()
    pcmNodeRef.current = null
    pcmSourceRef.current = null
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context && context.state !== 'closed') void context.close()
  }, [])

  const cleanupStream = useCallback(() => {
    cleanupPcm()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [cleanupPcm])

  const startPcmTap = useCallback(async (stream: MediaStream) => {
    if (!pcmFrameCallbackRef.current) return
    if (typeof AudioContext === 'undefined') {
      pcmErrorCallbackRef.current?.('Realtime PCM capture is not supported in this WebView')
      return
    }
    try {
      const context = new AudioContext({ latencyHint: 'interactive' })
      const source = context.createMediaStreamSource(stream)
      audioContextRef.current = context
      pcmSourceRef.current = source
      if (context.state === 'suspended') await context.resume()
      const emitPcm = (samples: Float32Array) => {
        try {
          pcmFrameCallbackRef.current?.(samples, context.sampleRate)
        } catch (error) {
          cleanupPcm()
          pcmErrorCallbackRef.current?.(
            error instanceof Error ? error.message : 'Realtime PCM processing failed',
          )
        }
      }

      if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        try {
          const moduleUrl = new URL(`${import.meta.env.BASE_URL}vinote-pcm-worklet.js`, window.location.href).toString()
          await context.audioWorklet.addModule(moduleUrl)
          const node = new AudioWorkletNode(context, 'vinote-pcm-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
          })
          node.port.onmessage = (event) => {
            emitPcm(new Float32Array(event.data))
          }
          source.connect(node)
          node.connect(context.destination)
          pcmNodeRef.current = node
          return
        } catch {
          // Some WebViews expose AudioWorklet but reject module URLs; use the silent fallback below.
        }
      }

      const processor = context.createScriptProcessor(2048, 1, 1)
      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0)
        emitPcm(new Float32Array(samples))
        event.outputBuffer.getChannelData(0).fill(0)
      }
      source.connect(processor)
      processor.connect(context.destination)
      pcmNodeRef.current = processor
    } catch (pcmError) {
      cleanupPcm()
      pcmErrorCallbackRef.current?.(
        pcmError instanceof Error ? pcmError.message : 'Realtime PCM capture is unavailable',
      )
    }
  }, [cleanupPcm])

  const stopActiveRecorder = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onerror = null
      recorder.onstop = null
      try {
        recorder.stop()
      } catch {
        // Ignore stop races during cleanup; the stream is also stopped below.
      }
    }
    recorderRef.current = null
  }, [])

  const reset = useCallback(() => {
    clearTimer()
    stopActiveRecorder()
    cleanupStream()
    chunksRef.current = []
    timerStartedAtRef.current = 0
    accumulatedMsRef.current = 0
    mimeTypeRef.current = ''
    setElapsedSeconds(0)
    setError('')
    setStatus('idle')
  }, [cleanupStream, clearTimer, stopActiveRecorder])

  const start = useCallback(async () => {
    if (!isSupported) {
      const message = 'This browser does not support audio recording.'
      setError(message)
      setStatus('failed')
      throw new Error(message)
    }

    reset()
    setStatus('requesting')

    try {
      await requestDesktopMicrophoneAccess()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (stream.getAudioTracks().length === 0) {
        throw new Error('microphone_no_audio_track')
      }
      const mimeType = getPreferredAudioMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)

      streamRef.current = stream
      await startPcmTap(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      mimeTypeRef.current = mimeType || recorder.mimeType || 'audio/webm'

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorder.onerror = () => {
        setError('Audio recording failed.')
        setStatus('failed')
      }

      recorder.start(1000)
      accumulatedMsRef.current = 0
      setElapsedSeconds(0)
      setStatus('recording')
      startTimer()
    } catch (recordingError) {
      cleanupStream()
      const message = recordingError instanceof Error ? recordingError.message : 'Failed to start audio recording.'
      setError(message)
      setStatus('failed')
      throw new Error(message)
    }
  }, [cleanupStream, isSupported, reset, startPcmTap, startTimer])

  const pause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') {
      return
    }

    recorder.pause()
    captureElapsed()
    clearTimer()
    setStatus('paused')
  }, [captureElapsed, clearTimer])

  const resume = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') {
      return
    }

    recorder.resume()
    setStatus('recording')
    startTimer()
  }, [startTimer])

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      throw new Error('No active meeting recording.')
    }

    captureElapsed()
    clearTimer()

    return new Promise<Blob>((resolve, reject) => {
      let settled = false
      let fallbackTimer: number | null = null

      const clearFallbackTimer = () => {
        if (fallbackTimer) {
          window.clearTimeout(fallbackTimer)
          fallbackTimer = null
        }
      }

      const finalize = () => {
        if (settled) {
          return
        }
        settled = true
        clearFallbackTimer()
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || recorder.mimeType || 'audio/webm' })
        recorder.onstop = null
        recorder.onerror = null
        recorderRef.current = null
        cleanupStream()
        setStatus('stopped')
        resolve(blob)
      }

      const fail = (message = 'Audio recording failed.') => {
        if (settled) {
          return
        }
        settled = true
        clearFallbackTimer()
        cleanupStream()
        setStatus('failed')
        reject(new Error(message))
      }

      recorder.onstop = finalize
      recorder.onerror = () => {
        fail()
      }

      fallbackTimer = window.setTimeout(finalize, STOP_FALLBACK_MS)

      try {
        recorder.requestData()
      } catch {
        // Some WebViews throw if data is not currently available; stop can still finalize the recording.
      }

      try {
        recorder.stop()
      } catch (stopError) {
        fail(stopError instanceof Error ? stopError.message : 'Failed to stop audio recording.')
      }
    })
  }, [captureElapsed, cleanupStream, clearTimer])

  useEffect(() => () => {
    clearTimer()
    stopActiveRecorder()
    cleanupStream()
  }, [cleanupStream, clearTimer, stopActiveRecorder])

  return {
    status,
    elapsedSeconds,
    error,
    isSupported,
    start,
    pause,
    resume,
    stop,
    reset,
  }
}
