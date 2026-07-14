import { describe, expect, it } from 'vitest'
import { encodeVla2Frame, RealtimePcmFramer } from './realtimeAudio'

function header(frame: Uint8Array) {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  return {
    magic: new TextDecoder().decode(frame.slice(0, 4)),
    version: frame[4],
    type: frame[5],
    flags: frame[6],
    sequence: Number(view.getBigUint64(8, true)),
    payloadLength: view.getUint32(16, true),
  }
}

function pcm(frames: Uint8Array[]) {
  return frames.flatMap((frame) => Array.from(frame.slice(20)))
}

describe('RealtimePcmFramer', () => {
  it('resamples consecutive 48 kHz chunks without resetting phase', () => {
    const framer = new RealtimePcmFramer()
    const first = framer.push(Float32Array.from({ length: 960 }, (_, index) => Math.sin(index / 20)), 48_000)
    const second = framer.push(Float32Array.from({ length: 960 }, (_, index) => Math.sin(index / 20)), 48_000)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(header(first[0])).toMatchObject({ magic: 'VLA2', version: 2, type: 1, flags: 1, sequence: 0, payloadLength: 640 })
    expect(header(second[0])).toMatchObject({ flags: 0, sequence: 1, payloadLength: 640 })
    expect(header(framer.finish()!)).toMatchObject({ flags: 2, sequence: 2, payloadLength: 0 })
    expect(framer.finish()).toBeNull()
  })

  it('does not advance sequence or resampling phase while paused', () => {
    const framer = new RealtimePcmFramer()
    framer.setPaused(true)
    expect(framer.push(new Float32Array(960).fill(1), 48_000)).toEqual([])
    framer.setPaused(false)
    const [frame] = framer.push(new Float32Array(960).fill(1), 48_000)
    expect(header(frame)).toMatchObject({ flags: 1, sequence: 0 })
  })

  it('produces the same PCM across arbitrary source chunk boundaries', () => {
    const samples = Float32Array.from({ length: 37 }, (_, index) => Math.sin(index / 4))
    const continuous = new RealtimePcmFramer()
    const chunked = new RealtimePcmFramer()
    const expectedFrames = continuous.push(samples, 44_100)
    const expectedLast = continuous.finish()
    if (expectedLast) expectedFrames.push(expectedLast)
    const actualFrames = Array.from(samples).flatMap((sample) => (
      chunked.push(new Float32Array([sample]), 44_100)
    ))
    const actualLast = chunked.finish()
    if (actualLast) actualFrames.push(actualLast)
    expect(pcm(actualFrames)).toEqual(pcm(expectedFrames))
  })

  it('rejects malformed frame inputs and unsupported source rates', () => {
    expect(() => encodeVla2Frame(-1, new Uint8Array(), 0)).toThrow('sequence')
    expect(() => encodeVla2Frame(0, new Uint8Array(32_002), 0)).toThrow('payload')
    expect(() => new RealtimePcmFramer().push(new Float32Array([0]), 8_000)).toThrow('at least 16 kHz')
    const framer = new RealtimePcmFramer()
    framer.push(new Float32Array([0]), 48_000)
    expect(() => framer.push(new Float32Array([0]), 44_100)).toThrow('source rate changed')
  })
})
