class VINotePcmProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length) {
      const copy = channel.slice()
      this.port.postMessage(copy, [copy.buffer])
    }
    for (const output of outputs) {
      for (const outputChannel of output) outputChannel.fill(0)
    }
    return true
  }
}

registerProcessor('vinote-pcm-processor', VINotePcmProcessor)
