// All interaction sounds share the music AudioContext, so cue times use one clock.
export class PlayerFeedback {
  private noise: AudioBuffer
  private ambience: { source: AudioBufferSourceNode; gain: GainNode; startedAt: number } | null = null
  private timers: ReturnType<typeof setTimeout>[] = []
  private cues = new Set<AudioScheduledSourceNode>()
  private knobSample: AudioBuffer | null = null
  private knobOffset = 0
  private recordSample: Promise<AudioBuffer | null>
  private tonearmSample: Promise<AudioBuffer | null>
  private buttonSample: Promise<AudioBuffer | null>
  private speedSample: Promise<AudioBuffer | null>
  private generation = 0
  constructor(private context: AudioContext) {
    this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    void fetch('/audio/knob-detent.mp3')
      .then(response => { if (!response.ok) throw new Error('Knob audio unavailable'); return response.arrayBuffer() })
      .then(bytes => context.decodeAudioData(bytes))
      .then(buffer => {
        this.knobSample = buffer
        // Skip leading silence so each detent responds immediately.
        const samples = buffer.getChannelData(0), limit = Math.min(samples.length, buffer.sampleRate * 2)
        let peak = 0
        for (let i = 0; i < limit; i++) peak = Math.max(peak, Math.abs(samples[i]))
        const threshold = peak * 0.22
        for (let i = 0; i < limit; i++) {
          if (Math.abs(samples[i]) >= threshold) { this.knobOffset = Math.max(0, i / buffer.sampleRate - 0.008); break }
        }
      })
      .catch(() => { /* Keep controls usable if the optional sound cannot load. */ })
    this.recordSample = fetch('/audio/record-drop.mp3')
      .then(response => { if (!response.ok) throw new Error('Record audio unavailable'); return response.arrayBuffer() })
      .then(bytes => context.decodeAudioData(bytes))
      .catch(() => null)
    this.tonearmSample = fetch('/audio/tonearm-move.wav')
      .then(response => { if (!response.ok) throw new Error('Tonearm audio unavailable'); return response.arrayBuffer() })
      .then(bytes => context.decodeAudioData(bytes))
      .catch(() => null)
    this.buttonSample = fetch('/audio/transport-button.mp3')
      .then(response => { if (!response.ok) throw new Error('Button audio unavailable'); return response.arrayBuffer() })
      .then(bytes => context.decodeAudioData(bytes))
      .catch(() => null)
    this.speedSample = fetch('/audio/speed-switch.wav')
      .then(response => { if (!response.ok) throw new Error('Speed switch audio unavailable'); return response.arrayBuffer() })
      .then(bytes => context.decodeAudioData(bytes))
      .catch(() => null)
  }
  playSpeedSwitch() {
    const generation = this.generation
    this.vibrate(32)
    void this.speedSample.then(buffer => {
      if (!buffer || generation !== this.generation) return
      const source = this.context.createBufferSource(), gain = this.context.createGain()
      source.buffer = buffer
      gain.gain.value = 0.7
      source.connect(gain).connect(this.context.destination)
      this.cues.add(source); source.onended = () => this.cues.delete(source)
      source.start()
    })
  }
  playButtonClick() {
    const generation = this.generation
    this.vibrate(10)
    void this.buttonSample.then(buffer => {
      if (!buffer || generation !== this.generation) return
      const source = this.context.createBufferSource(), gain = this.context.createGain()
      source.buffer = buffer
      source.playbackRate.value = 1.5
      gain.gain.value = 0.7
      source.connect(gain).connect(this.context.destination)
      this.cues.add(source); source.onended = () => this.cues.delete(source)
      source.start()
    })
  }
  playRecordDrop(delay: number, onEnded: () => void) {
    const generation = this.generation
    const due = performance.now() + delay
    this.vibrate(26, delay)
    void this.recordSample.then(buffer => {
      if (generation !== this.generation) return
      if (!buffer) {
        this.timers.push(setTimeout(() => { if (generation === this.generation) onEnded() }, Math.max(0, due - performance.now())))
        return
      }
      const at = this.context.currentTime + Math.max(0, due - performance.now()) / 1000 + 0.005
      const source = this.context.createBufferSource(), gain = this.context.createGain()
      source.buffer = buffer
      source.playbackRate.value = 1.5
      gain.gain.value = 0.85
      source.connect(gain).connect(this.context.destination)
      this.cues.add(source)
      source.onended = () => {
        this.cues.delete(source)
        if (generation === this.generation) onEnded()
      }
      source.start(at)
    })
  }
  playTonearmMove(delay = 0) {
    const generation = this.generation
    const due = performance.now() + delay
    void this.tonearmSample.then(buffer => {
      if (!buffer || generation !== this.generation) return
      const at = this.context.currentTime + Math.max(0, due - performance.now()) / 1000 + 0.005
      const source = this.context.createBufferSource(), gain = this.context.createGain()
      source.buffer = buffer
      source.playbackRate.value = 2
      gain.gain.value = 0.75
      source.connect(gain).connect(this.context.destination)
      this.cues.add(source); source.onended = () => this.cues.delete(source)
      source.start(at)
    })
  }
  private knobClick(at: number, level: number) {
    if (!this.knobSample) return
    const duration = Math.min(0.18, this.knobSample.duration - this.knobOffset)
    if (duration <= 0) return
    const source = this.context.createBufferSource(), gain = this.context.createGain()
    source.buffer = this.knobSample
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.004)
    gain.gain.setValueAtTime(level, at + Math.max(0.005, duration - 0.025))
    gain.gain.linearRampToValueAtTime(0, at + duration)
    source.connect(gain).connect(this.context.destination)
    this.cues.add(source); source.onended = () => this.cues.delete(source)
    source.start(at, this.knobOffset, duration)
  }
  private pulse(at: number, frequency: number, duration: number, level: number, type: OscillatorType = 'sine') {
    const oscillator = this.context.createOscillator(), gain = this.context.createGain()
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.55), at + duration)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(level, at + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    oscillator.connect(gain).connect(this.context.destination)
    this.cues.add(oscillator); oscillator.onended = () => this.cues.delete(oscillator)
    oscillator.start(at); oscillator.stop(at + duration + 0.01)
  }
  private vibrate(ms: number, delay = 0) {
    const timer = setTimeout(() => { if (document.visibilityState === 'visible') navigator.vibrate?.(ms) }, delay)
    this.timers.push(timer)
  }
  cue(kind: 'volume' | 'tone' | 'motor', delay = 0) {
    const at = this.context.currentTime + Math.max(0, delay) / 1000 + 0.005
    switch (kind) {
      case 'volume': this.knobClick(at, 0.65); this.vibrate(5, delay); break
      case 'tone': this.knobClick(at, 0.4); this.vibrate(5, delay); break
      case 'motor': this.pulse(at, 90, 0.65, 0.04, 'sawtooth'); break
    }
  }
  startAmbience(delay = 0) {
    this.stopAmbience()
    const at = this.context.currentTime + Math.max(0, delay) / 1000 + 0.005
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain()
    source.buffer = this.noise; source.loop = true
    filter.type = 'lowpass'; filter.frequency.value = 2200
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.01, at + 0.7)
    source.connect(filter).connect(gain).connect(this.context.destination)
    source.start(at); this.ambience = { source, gain, startedAt: at }
  }
  stopAmbience() {
    if (!this.ambience) return
    const { source, gain, startedAt } = this.ambience, at = Math.max(this.context.currentTime, startedAt)
    gain.gain.cancelScheduledValues(at); gain.gain.setValueAtTime(gain.gain.value, at)
    gain.gain.linearRampToValueAtTime(0, at + 0.12)
    source.stop(at + 0.13); this.ambience = null
  }
  cancel() {
    this.generation++
    this.timers.forEach(clearTimeout); this.timers = []
    for (const cue of this.cues) { try { cue.stop() } catch {} }
    this.cues.clear(); this.stopAmbience()
  }
}
