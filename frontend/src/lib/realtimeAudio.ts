const TARGET_SAMPLE_RATE = 16_000
const MAX_PAYLOAD_BYTES = 32_000
const PACKET_PAYLOAD_BYTES = 640

export function encodeVla2Frame(sequence: number, payload: Uint8Array, flags: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('Invalid PCM sequence')
  if (flags & ~0x03) throw new Error('Invalid PCM flags')
  if (payload.byteLength > MAX_PAYLOAD_BYTES || payload.byteLength % 2 !== 0) {
    throw new Error('Invalid PCM payload size')
  }
  const frame = new Uint8Array(20 + payload.byteLength)
  frame.set([0x56, 0x4c, 0x41, 0x32, 2, 1, flags, 0], 0)
  const view = new DataView(frame.buffer)
  view.setBigUint64(8, BigInt(sequence), true)
  view.setUint32(16, payload.byteLength, true)
  frame.set(payload, 20)
  return frame
}

export class RealtimePcmFramer {
  private sequence = 0
  private sourcePosition = 0
  private sourceBuffer = new Float32Array()
  private sourceSampleRate: number | null = null
  private pendingPcm: number[] = []
  private paused = false
  private finished = false

  setPaused(paused: boolean) {
    this.paused = paused
  }

  push(samples: Float32Array, sourceSampleRate: number): Uint8Array[] {
    if (this.finished || this.paused || samples.length === 0) return []
    if (!Number.isFinite(sourceSampleRate) || sourceSampleRate < TARGET_SAMPLE_RATE) {
      throw new Error('Realtime audio source rate must be at least 16 kHz')
    }
    if (this.sourceSampleRate !== null && this.sourceSampleRate !== sourceSampleRate) {
      throw new Error('Realtime audio source rate changed during the session')
    }
    this.sourceSampleRate = sourceSampleRate
    const ratio = sourceSampleRate / TARGET_SAMPLE_RATE
    const buffered = new Float32Array(this.sourceBuffer.length + samples.length)
    buffered.set(this.sourceBuffer)
    buffered.set(samples, this.sourceBuffer.length)
    const pcm: number[] = []
    while (this.sourcePosition < buffered.length) {
      const left = Math.floor(this.sourcePosition)
      const fraction = this.sourcePosition - left
      const right = left + 1
      if (fraction > 0 && right >= buffered.length) break
      const sample = fraction > 0
        ? buffered[left] + (buffered[right] - buffered[left]) * fraction
        : buffered[left]
      const normalized = Math.max(-1, Math.min(1, sample))
      pcm.push(normalized < 0 ? Math.round(normalized * 32768) : Math.round(normalized * 32767))
      this.sourcePosition += ratio
    }
    const consumed = Math.min(Math.floor(this.sourcePosition), buffered.length)
    this.sourceBuffer = buffered.slice(consumed)
    this.sourcePosition -= consumed

    for (const sample of pcm) {
      this.pendingPcm.push(sample & 0xff, (sample >> 8) & 0xff)
    }
    const frames: Uint8Array[] = []
    while (this.pendingPcm.length >= PACKET_PAYLOAD_BYTES) {
      const payload = new Uint8Array(this.pendingPcm.splice(0, PACKET_PAYLOAD_BYTES))
      const flags = this.sequence === 0 ? 0x01 : 0
      frames.push(encodeVla2Frame(this.sequence, payload, flags))
      this.sequence += 1
    }
    return frames
  }

  finish() {
    if (this.finished) return null
    this.finished = true
    const flags = (this.sequence === 0 ? 0x01 : 0) | 0x02
    const frame = encodeVla2Frame(this.sequence, new Uint8Array(this.pendingPcm), flags)
    this.pendingPcm = []
    this.sequence += 1
    return frame
  }
}
