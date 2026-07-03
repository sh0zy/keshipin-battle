// 効果音: WebAudio 自前合成 (追加ライブラリなし)
let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('keshipin-muted') === '1'

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    if (!('AudioContext' in window)) return null
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.22
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** 最初のユーザー操作で呼ぶ (autoplay 制限対策) */
export function primeAudio() {
  ac()
}

export function isMuted() {
  return muted
}

export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem('keshipin-muted', m ? '1' : '0')
  } catch {
    /* プライベートモード等は無視 */
  }
}

interface ToneOpts {
  type?: OscillatorType
  vol?: number
  glideTo?: number
  delay?: number
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  const c = ac()
  if (!c || muted || !master) return
  const { type = 'sine', vol = 0.5, glideTo, delay = 0 } = opts
  const t0 = c.currentTime + delay
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(Math.max(freq, 1), t0)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  g.connect(master)
  o.start(t0)
  o.stop(t0 + dur + 0.03)
}

interface NoiseOpts {
  vol?: number
  freq?: number
  glideTo?: number
  q?: number
  delay?: number
}

function noise(dur: number, opts: NoiseOpts = {}) {
  const c = ac()
  if (!c || muted || !master) return
  const { vol = 0.4, freq = 1500, glideTo, q = 1, delay = 0 } = opts
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.ceil(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(freq, t0)
  if (glideTo) f.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), t0 + dur)
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t0)
}

export const sfx = {
  /** ボタン */
  click() {
    tone(700, 0.06, { type: 'triangle', vol: 0.35 })
  },
  /** ギア装備 */
  equip() {
    tone(520, 0.08, { type: 'triangle', vol: 0.45 })
    tone(780, 0.1, { type: 'triangle', vol: 0.45, delay: 0.07 })
  },
  /** ギアはずす */
  unequip() {
    tone(430, 0.09, { type: 'triangle', vol: 0.4 })
  },
  /** 発射 (パワーで音が変わる) */
  launch(power: number) {
    noise(0.18, { vol: 0.4 + power * 0.35, freq: 600, glideTo: 2400, q: 1.2 })
    tone(180 + power * 160, 0.12, { type: 'sine', vol: 0.35 })
  },
  /** 衝突 (強さで音量) */
  hit(strength: number) {
    const v = Math.min(0.25 + strength / 700, 0.9)
    noise(0.09, { vol: v, freq: 2200, q: 0.8 })
    tone(130, 0.12, { type: 'sine', vol: v * 0.9, glideTo: 70 })
  },
  /** 壁ヒット (コンッ) */
  wall() {
    tone(420, 0.07, { type: 'square', vol: 0.25, glideTo: 300 })
    noise(0.05, { vol: 0.2, freq: 1800 })
  },
  /** 落下 (ヒュ〜) */
  fall() {
    tone(680, 0.5, { type: 'sine', vol: 0.45, glideTo: 110 })
  },
  /** テープセーフ */
  tape() {
    tone(900, 0.12, { type: 'triangle', vol: 0.4, glideTo: 1400 })
    tone(1400, 0.1, { type: 'triangle', vol: 0.3, delay: 0.1, glideTo: 1100 })
  },
  /** 分度器バウンド (ビヨーン) */
  bounce() {
    tone(240, 0.28, { type: 'sine', vol: 0.45, glideTo: 520 })
  },
  /** クリティカル */
  crit() {
    ;[880, 1175, 1568].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.3, delay: i * 0.05 }))
    noise(0.25, { vol: 0.25, freq: 5000, q: 2 })
  },
  /** ラウンド獲得 */
  round() {
    tone(523, 0.12, { type: 'triangle', vol: 0.45 })
    tone(784, 0.2, { type: 'triangle', vol: 0.45, delay: 0.12 })
  },
  /** 勝利ファンファーレ */
  win() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.45, delay: i * 0.11 }))
  },
  /** 敗北 */
  lose() {
    tone(300, 0.3, { type: 'triangle', vol: 0.35, glideTo: 180 })
    tone(180, 0.4, { type: 'triangle', vol: 0.3, delay: 0.25, glideTo: 120 })
  },
  /** サドンデス警報 */
  shrink() {
    tone(220, 0.14, { type: 'square', vol: 0.35 })
    tone(220, 0.14, { type: 'square', vol: 0.35, delay: 0.19 })
  },
  /** エモート送信 */
  emote() {
    tone(880, 0.07, { type: 'triangle', vol: 0.35 })
    tone(1320, 0.09, { type: 'triangle', vol: 0.3, delay: 0.06 })
  },
  /** 先生のあしおと (コツコツ) */
  knock() {
    tone(240, 0.06, { type: 'square', vol: 0.3, glideTo: 180 })
    tone(240, 0.06, { type: 'square', vol: 0.3, delay: 0.16, glideTo: 180 })
  },
  /** 先生とうじょう */
  teacher() {
    tone(660, 0.15, { type: 'sine', vol: 0.4, glideTo: 520 })
    tone(440, 0.22, { type: 'sine', vol: 0.4, delay: 0.15, glideTo: 392 })
  },
  /** 先生が行った (ほっ) */
  relief() {
    tone(392, 0.1, { type: 'triangle', vol: 0.35 })
    tone(523, 0.14, { type: 'triangle', vol: 0.35, delay: 0.09 })
  },
}

/* ---------------- チップチューンBGM (自前ステップシーケンサ) ---------------- */
export type BgmTrack = 'title' | 'battle' | 'danger' | 'result'

interface BgmPattern {
  bpm: number
  melody: number[] // MIDIノート (0 = 休符)
  bass: number[]
  hatEvery: number
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

const BGM: Record<BgmTrack, BgmPattern> = {
  // のんき (タイトル/準備画面)
  title: {
    bpm: 96,
    hatEvery: 4,
    melody: [72, 0, 76, 79, 0, 76, 0, 72, 74, 0, 77, 0, 76, 74, 72, 0],
    bass: [48, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 55, 0, 43, 0],
  },
  // アップテンポ (バトル)
  battle: {
    bpm: 138,
    hatEvery: 2,
    melody: [69, 0, 69, 72, 0, 74, 0, 76, 0, 74, 72, 0, 74, 0, 69, 0],
    bass: [45, 45, 0, 45, 48, 0, 45, 0, 43, 43, 0, 43, 50, 0, 45, 0],
  },
  // あせり (サドンデス)
  danger: {
    bpm: 160,
    hatEvery: 1,
    melody: [69, 0, 68, 0, 69, 0, 68, 69, 71, 0, 69, 0, 68, 0, 65, 0],
    bass: [41, 0, 41, 41, 0, 41, 0, 41, 40, 0, 40, 40, 0, 40, 0, 40],
  },
  // おいわい (リザルト)
  result: {
    bpm: 108,
    hatEvery: 4,
    melody: [72, 76, 79, 84, 0, 79, 84, 0, 81, 77, 74, 77, 81, 0, 79, 0],
    bass: [48, 0, 52, 0, 53, 0, 55, 0, 53, 0, 52, 0, 55, 0, 48, 0],
  },
}

let bgmGainNode: GainNode | null = null
let bgmTrack: BgmTrack | null = null
let bgmTimer: number | null = null
let bgmStep = 0
let bgmNext = 0
let noiseBuf: AudioBuffer | null = null

function bgmGain(c: AudioContext): GainNode {
  if (!bgmGainNode) {
    bgmGainNode = c.createGain()
    bgmGainNode.gain.value = 0.6
    bgmGainNode.connect(master!)
  }
  return bgmGainNode
}

function bgmNote(c: AudioContext, midi: number, t: number, dur: number, type: OscillatorType, vol: number) {
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(midiHz(midi), t)
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.012)
  g.gain.setValueAtTime(vol, t + dur * 0.55)
  g.gain.linearRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(bgmGain(c))
  o.start(t)
  o.stop(t + dur + 0.02)
}

function bgmHat(c: AudioContext, t: number) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.05), c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 6500
  const g = c.createGain()
  g.gain.setValueAtTime(0.1, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
  src.connect(f)
  f.connect(g)
  g.connect(bgmGain(c))
  src.start(t)
}

// 先読みスケジューラ: 120ms ごとに 0.32秒ぶんの音符を予約
function bgmTick() {
  const c = ac()
  if (!c || !bgmTrack || c.state !== 'running') return
  const pat = BGM[bgmTrack]
  const stepDur = 60 / pat.bpm / 2 // 8分音符
  if (bgmNext < c.currentTime) bgmNext = c.currentTime + 0.06
  while (bgmNext < c.currentTime + 0.32) {
    if (!muted) {
      const m = pat.melody[bgmStep % pat.melody.length]
      const b = pat.bass[bgmStep % pat.bass.length]
      if (m) bgmNote(c, m, bgmNext, stepDur * 0.85, 'square', 0.09)
      if (b) bgmNote(c, b, bgmNext, stepDur * 0.95, 'triangle', 0.15)
      if (bgmStep % pat.hatEvery === 0) bgmHat(c, bgmNext)
    }
    bgmNext += stepDur
    bgmStep++
  }
}

/** BGMを切り替える (null で停止)。ミュート中は自動で無音 */
export function playBgm(track: BgmTrack | null) {
  if (track === bgmTrack) return
  bgmTrack = track
  bgmStep = 0
  bgmNext = 0
  if (track && bgmTimer === null) {
    bgmTimer = window.setInterval(bgmTick, 120)
  } else if (!track && bgmTimer !== null) {
    window.clearInterval(bgmTimer)
    bgmTimer = null
  }
}
