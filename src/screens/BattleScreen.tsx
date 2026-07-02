// バトル画面: 木目の机 + パチンコ式ドラッグ + ステージギミック(壁/穴) + 演出
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  PLAYER_COLORS,
  computeBuild,
  gearById,
  playerLabel,
  type Build,
  type Mode,
  type PlayerId,
} from '../game/data'
import {
  DESK,
  MAX_DRAG,
  WORLD,
  aliveCount,
  allSettled,
  createRoundPieces,
  launchPiece,
  stepSim,
  type Charges,
  type Piece,
  type SimEvent,
} from '../game/physics'
import type { Stage, Wall } from '../game/stages'
import { SketchButton, cx } from '../components/ui'

type Phase = 'intro' | 'aim' | 'sim' | 'roundEnd' | 'matchEnd'

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; size: number; color: string
  kind: 'spark' | 'dust' | 'star'; rot: number; vr: number
}
interface TextPop { x: number; y: number; text: string; life: number; max: number; color: string; size: number }

interface Sim {
  pieces: Piece[]
  builds: [Build, Build]
  charges: Charges
  particles: Particle[]
  pops: TextPop[]
  shake: number
  flash: number
  phase: Phase
  turn: PlayerId
  round: number
  starter: PlayerId
  scores: [number, number]
  timer: number
  simTime: number
  time: number
  drag: { pieceId: number; px: number; py: number } | null
  cpu: { pieceId: number; tx: number; ty: number; power: number; t: number } | null
  finished: boolean
}

interface Hud {
  phase: Phase
  turn: PlayerId
  round: number
  scores: [number, number]
  alive: [number, number]
}
interface Announce { id: number; title: string; sub?: string; color?: string }

const HIT_WORDS = ['ゴンッ!', 'パチンッ!', 'ドカッ!']
const rand = (a: number, b: number) => a + Math.random() * (b - a)

/* ---------------- 木目テクスチャ (1回だけ生成してキャッシュ) ---------------- */
let woodCache: HTMLCanvasElement | null = null
function getWood(): HTMLCanvasElement {
  if (woodCache) return woodCache
  const c = document.createElement('canvas')
  c.width = DESK.w
  c.height = DESK.h
  const g = c.getContext('2d')!
  const rows = 8
  const ph = DESK.h / rows
  const lights = [61, 57, 60, 63, 56, 59, 62, 58]
  for (let r = 0; r < rows; r++) {
    g.fillStyle = `hsl(31 45% ${lights[r]}%)`
    g.fillRect(0, r * ph, DESK.w, ph)
    const grad = g.createLinearGradient(0, r * ph, 0, r * ph + ph)
    grad.addColorStop(0, 'rgba(255,240,220,0.14)')
    grad.addColorStop(1, 'rgba(90,50,20,0.10)')
    g.fillStyle = grad
    g.fillRect(0, r * ph, DESK.w, ph)
    // 木目の流れ
    for (let i = 0; i < 8; i++) {
      const y0 = r * ph + rand(4, ph - 4)
      g.beginPath()
      g.moveTo(0, y0)
      for (let x = 0; x <= DESK.w; x += 55) {
        g.quadraticCurveTo(x + 27, y0 + rand(-4, 4), x + 55, y0 + rand(-2.5, 2.5))
      }
      g.strokeStyle = `rgba(120,66,28,${rand(0.07, 0.16)})`
      g.lineWidth = rand(0.7, 1.9)
      g.stroke()
    }
    // 節
    for (let i = 0; i < 2; i++) {
      const kx = rand(30, DESK.w - 30)
      const ky = r * ph + rand(10, ph - 10)
      const kr = rand(5, 10)
      const rg = g.createRadialGradient(kx, ky, 1, kx, ky, kr)
      rg.addColorStop(0, 'rgba(96,52,20,0.4)')
      rg.addColorStop(1, 'rgba(96,52,20,0)')
      g.fillStyle = rg
      g.beginPath()
      g.ellipse(kx, ky, kr * 1.4, kr, rand(0, 3), 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = 'rgba(88,48,18,0.32)'
    g.fillRect(0, r * ph - 1, DESK.w, 2)
  }
  woodCache = c
  return c
}

/* ---------------- 描画ヘルパー ---------------- */
function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

// えんぴつの壁 (縦向き)
function drawPencilWall(g: CanvasRenderingContext2D, w: Wall) {
  const tipH = 30
  const bandH = 10
  const eraserH = 16
  // 本体
  roundRectPath(g, w.x, w.y + tipH, w.w, w.h - tipH - bandH - eraserH, 3)
  g.fillStyle = '#fbbf24'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.4
  g.stroke()
  // 面取りライン
  g.strokeStyle = 'rgba(66,32,6,0.18)'
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(w.x + w.w * 0.34, w.y + tipH + 2)
  g.lineTo(w.x + w.w * 0.34, w.y + w.h - bandH - eraserH - 2)
  g.moveTo(w.x + w.w * 0.66, w.y + tipH + 2)
  g.lineTo(w.x + w.w * 0.66, w.y + w.h - bandH - eraserH - 2)
  g.stroke()
  // 削った木 + 芯
  g.beginPath()
  g.moveTo(w.x, w.y + tipH)
  g.lineTo(w.x + w.w, w.y + tipH)
  g.lineTo(w.x + w.w / 2, w.y)
  g.closePath()
  g.fillStyle = '#e7c496'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.2
  g.stroke()
  g.beginPath()
  g.moveTo(w.x + w.w / 2 - 4, w.y + 9)
  g.lineTo(w.x + w.w / 2 + 4, w.y + 9)
  g.lineTo(w.x + w.w / 2, w.y + 1)
  g.closePath()
  g.fillStyle = '#374151'
  g.fill()
  // 金具 + 消しゴム
  g.fillStyle = '#cbd5e1'
  g.fillRect(w.x, w.y + w.h - bandH - eraserH, w.w, bandH)
  g.strokeStyle = '#422006'
  g.lineWidth = 1.6
  g.strokeRect(w.x, w.y + w.h - bandH - eraserH, w.w, bandH)
  roundRectPath(g, w.x, w.y + w.h - eraserH, w.w, eraserH, 4)
  g.fillStyle = '#f9a8d4'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2
  g.stroke()
}

// ふでばこの壁
function drawCaseWall(g: CanvasRenderingContext2D, w: Wall) {
  g.fillStyle = 'rgba(66,32,6,0.18)'
  roundRectPath(g, w.x + 4, w.y + 6, w.w, w.h, 12)
  g.fill()
  roundRectPath(g, w.x, w.y, w.w, w.h, 12)
  g.fillStyle = '#5b7291'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.6
  g.stroke()
  // ファスナー
  g.strokeStyle = 'rgba(255,255,255,0.75)'
  g.lineWidth = 2.5
  g.setLineDash([6, 4])
  g.beginPath()
  g.moveTo(w.x + 12, w.y + 15)
  g.lineTo(w.x + w.w - 20, w.y + 15)
  g.stroke()
  g.setLineDash([])
  g.fillStyle = '#e2e8f0'
  g.beginPath()
  g.arc(w.x + w.w - 16, w.y + 15, 5, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 1.5
  g.stroke()
  // ネームタグ
  roundRectPath(g, w.x + 12, w.y + w.h - 28, 52, 16, 4)
  g.fillStyle = '#fff7ed'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 1.5
  g.stroke()
  g.strokeStyle = 'rgba(66,32,6,0.35)'
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(w.x + 18, w.y + w.h - 20)
  g.lineTo(w.x + 56, w.y + w.h - 20)
  g.stroke()
}

// インクの穴
function drawHole(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#2b2350'
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  // まわりのしみ
  g.arc(x + r * 0.75, y - r * 0.45, r * 0.4, 0, Math.PI * 2)
  g.arc(x - r * 0.8, y + r * 0.35, r * 0.33, 0, Math.PI * 2)
  g.arc(x + r * 0.35, y + r * 0.8, r * 0.28, 0, Math.PI * 2)
  g.fill()
  const rg = g.createRadialGradient(x, y, r * 0.1, x, y, r)
  rg.addColorStop(0, '#0e0a24')
  rg.addColorStop(1, 'rgba(14,10,36,0)')
  g.fillStyle = rg
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = 'rgba(147,197,253,0.3)'
  g.lineWidth = 2
  g.beginPath()
  g.arc(x - r * 0.25, y - r * 0.25, r * 0.55, Math.PI * 0.9, Math.PI * 1.6)
  g.stroke()
}

function drawTable(g: CanvasRenderingContext2D, stage: Stage) {
  // ノートの紙 + 罫線
  g.fillStyle = '#fff7ed'
  g.fillRect(0, 0, WORLD.w, WORLD.h)
  g.fillStyle = 'rgba(37,99,235,0.08)'
  for (let y = 34; y < WORLD.h; y += 34) g.fillRect(0, y, WORLD.w, 2)
  g.fillStyle = 'rgba(225,29,72,0.16)'
  g.fillRect(30, 0, 2, WORLD.h)
  // 机の影
  g.fillStyle = 'rgba(66,32,6,0.15)'
  roundRectPath(g, DESK.x + 9, DESK.y + 13, DESK.w, DESK.h, 20)
  g.fill()
  // 木目
  g.save()
  roundRectPath(g, DESK.x, DESK.y, DESK.w, DESK.h, 18)
  g.clip()
  g.drawImage(getWood(), DESK.x, DESK.y)
  g.strokeStyle = 'rgba(60,30,8,0.22)'
  g.lineWidth = 16
  roundRectPath(g, DESK.x, DESK.y, DESK.w, DESK.h, 18)
  g.stroke()
  g.restore()
  // 机のふち
  g.strokeStyle = '#7c4a21'
  g.lineWidth = 7
  roundRectPath(g, DESK.x, DESK.y, DESK.w, DESK.h, 18)
  g.stroke()
  // 落下警告の点線 (開いているふちだけ)
  const ix = DESK.x + 24
  const iy = DESK.y + 24
  const iw = DESK.w - 48
  const ih = DESK.h - 48
  g.strokeStyle = 'rgba(66,32,6,0.22)'
  g.lineWidth = 2.5
  g.setLineDash([12, 10])
  g.beginPath()
  if (stage.openEdges.top) { g.moveTo(ix, iy); g.lineTo(ix + iw, iy) }
  if (stage.openEdges.bottom) { g.moveTo(ix, iy + ih); g.lineTo(ix + iw, iy + ih) }
  if (stage.openEdges.left) { g.moveTo(ix, iy); g.lineTo(ix, iy + ih) }
  if (stage.openEdges.right) { g.moveTo(ix + iw, iy); g.lineTo(ix + iw, iy + ih) }
  g.stroke()
  g.setLineDash([])
  // ステージギミック
  for (const h of stage.holes) drawHole(g, h.x, h.y, h.r)
  for (const w of stage.walls) {
    if (w.kind === 'pencil') drawPencilWall(g, w)
    else drawCaseWall(g, w)
  }
}

function drawEraser(g: CanvasRenderingContext2D, p: Piece, time: number, active: boolean, dragging: boolean) {
  const color = PLAYER_COLORS[p.player]
  let alpha = 1
  let scale = 1
  if (p.state === 'falling') {
    const t = Math.min(p.fallT / 0.55, 1)
    alpha = 1 - t
    scale = 1 - 0.75 * t
  }
  const r = p.radius * scale
  const w = r * 2.15
  const h = r * 1.5
  g.save()
  g.globalAlpha = alpha
  // 影
  if (p.state === 'alive') {
    g.fillStyle = 'rgba(66,32,6,0.18)'
    g.beginPath()
    g.ellipse(p.x + 3, p.y + 5, r * 1.06, r * 0.74, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.translate(p.x, p.y)
  g.rotate(p.angle)
  // 本体
  roundRectPath(g, -w / 2, -h / 2, w, h, 7)
  g.fillStyle = '#fbf3e4'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.6
  g.stroke()
  g.fillStyle = 'rgba(66,32,6,0.07)'
  roundRectPath(g, -w / 2 + 2, 2, w - 4, h / 2 - 4, 5)
  g.fill()
  // スリーブ
  roundRectPath(g, -w * 0.21, -h / 2 - 1.5, w * 0.42, h + 3, 5)
  g.fillStyle = color
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.4
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.5)'
  g.lineWidth = 1.6
  g.beginPath()
  g.moveTo(-w * 0.15, -h / 2 + 2)
  g.lineTo(-w * 0.15, h / 2 - 2)
  g.moveTo(w * 0.15, -h / 2 + 2)
  g.lineTo(w * 0.15, h / 2 - 2)
  g.stroke()
  // 番号
  g.fillStyle = 'white'
  g.font = `bold ${r * 0.72}px Kalam, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(p.player + 1), 0, 1)
  // 顔
  g.fillStyle = '#422006'
  const fx = -w * 0.355
  if (p.state === 'falling') {
    g.strokeStyle = '#422006'
    g.lineWidth = 1.8
    g.beginPath()
    g.moveTo(fx - 4, -5); g.lineTo(fx + 1, 0); g.moveTo(fx + 1, -5); g.lineTo(fx - 4, 0)
    g.moveTo(fx + 4, -5); g.lineTo(fx + 9, 0); g.moveTo(fx + 9, -5); g.lineTo(fx + 4, 0)
    g.stroke()
  } else {
    g.beginPath()
    g.arc(fx - 2, -3, 1.9, 0, Math.PI * 2)
    g.arc(fx + 6, -3, 1.9, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#422006'
    g.lineWidth = 1.8
    g.beginPath()
    g.arc(fx + 2, 3, 4.5, 0.15 * Math.PI, 0.85 * Math.PI)
    g.stroke()
  }
  // ギアバッジ
  p.emojis.slice(0, 2).forEach((gid, i) => {
    const bx = w * 0.34
    const by = -h * 0.42 + i * h * 0.84
    g.beginPath()
    g.arc(bx, by, r * 0.34, 0, Math.PI * 2)
    g.fillStyle = 'white'
    g.fill()
    g.strokeStyle = '#422006'
    g.lineWidth = 1.6
    g.stroke()
    g.font = `${r * 0.42}px sans-serif`
    g.fillText(gearById(gid).emoji, bx, by + 0.5)
  })
  g.restore()

  // 自分のターンの光る点線リング
  if (p.state === 'alive' && active) {
    g.save()
    g.translate(p.x, p.y)
    g.rotate(time * 0.9)
    g.strokeStyle = color
    g.globalAlpha = dragging ? 0.95 : 0.55 + 0.25 * Math.sin(time * 5)
    g.lineWidth = dragging ? 4 : 3
    g.setLineDash([8, 8])
    g.beginPath()
    g.arc(0, 0, p.radius + 8, 0, Math.PI * 2)
    g.stroke()
    g.restore()
  }
}

function drawAim(g: CanvasRenderingContext2D, p: Piece, px: number, py: number, color: string) {
  const dx = p.x - px
  const dy = p.y - py
  const len = Math.hypot(dx, dy)
  const power = Math.min(len / MAX_DRAG, 1)
  if (len < 4) return
  const nx = dx / len
  const ny = dy / len
  // 引っぱりゴム
  g.strokeStyle = 'rgba(66,32,6,0.45)'
  g.lineWidth = 2.5
  g.beginPath()
  g.moveTo(px, py)
  g.lineTo(p.x, p.y)
  g.stroke()
  g.fillStyle = 'rgba(66,32,6,0.45)'
  g.beginPath()
  g.arc(px, py, 6, 0, Math.PI * 2)
  g.fill()
  // ねらい線(鉛筆の点線)
  const tipX = p.x + nx * (55 + power * 225)
  const tipY = p.y + ny * (55 + power * 225)
  g.strokeStyle = color
  g.globalAlpha = 0.85
  g.lineWidth = 3.5
  g.setLineDash([11, 9])
  g.beginPath()
  g.moveTo(p.x + nx * p.radius, p.y + ny * p.radius)
  g.lineTo(tipX, tipY)
  g.stroke()
  g.setLineDash([])
  const a = Math.atan2(ny, nx)
  g.fillStyle = color
  g.beginPath()
  g.moveTo(tipX + Math.cos(a) * 14, tipY + Math.sin(a) * 14)
  g.lineTo(tipX + Math.cos(a + 2.5) * 11, tipY + Math.sin(a + 2.5) * 11)
  g.lineTo(tipX + Math.cos(a - 2.5) * 11, tipY + Math.sin(a - 2.5) * 11)
  g.closePath()
  g.fill()
  g.globalAlpha = 1
  // パワーゲージ(リング)
  const hue = 120 - power * 120
  g.strokeStyle = `hsl(${hue} 85% 42%)`
  g.lineWidth = 5.5
  g.beginPath()
  g.arc(p.x, p.y, p.radius + 15, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2)
  g.stroke()
  g.fillStyle = '#422006'
  g.font = 'bold 17px Kalam, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.strokeStyle = '#fff7ed'
  g.lineWidth = 4
  const label = `${Math.round(power * 100)}%`
  g.strokeText(label, p.x, p.y - p.radius - 28)
  g.fillText(label, p.x, p.y - p.radius - 28)
}

/* ================================================================ */
export default function BattleScreen({
  mode,
  stage,
  loadouts,
  onFinish,
  onExit,
}: {
  mode: Mode
  stage: Stage
  loadouts: [string[], string[]]
  onFinish: (winner: PlayerId, score: [number, number]) => void
  onExit: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Sim | null>(null)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  const stageRef = useRef(stage)
  stageRef.current = stage

  const [hud, setHud] = useState<Hud>({ phase: 'intro', turn: 0, round: 1, scores: [0, 0], alive: [3, 3] })
  const [announce, setAnnounce] = useState<Announce | null>(null)

  // アナウンスの自動消去
  useEffect(() => {
    if (!announce) return
    const t = setTimeout(() => setAnnounce(null), 1500)
    return () => clearTimeout(t)
  }, [announce])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const builds: [Build, Build] = [computeBuild(loadouts[0]), computeBuild(loadouts[1])]
    const st = stageRef.current
    let announceId = 0

    const sim: Sim = {
      pieces: createRoundPieces(builds),
      builds,
      charges: { tapeUsed: [false, false], protUsed: [false, false] },
      particles: [],
      pops: [],
      shake: 0,
      flash: 0,
      phase: 'intro',
      turn: 0,
      round: 1,
      starter: 0,
      scores: [0, 0],
      timer: 1.3,
      simTime: 0,
      time: 0,
      drag: null,
      cpu: null,
      finished: false,
    }
    simRef.current = sim

    const label = (p: PlayerId) => playerLabel(mode, p)
    const isCpuTurn = () => mode === '1p' && sim.turn === 1

    const say = (title: string, sub?: string, color?: string) =>
      setAnnounce({ id: ++announceId, title, sub, color })

    const sync = () =>
      setHud({
        phase: sim.phase,
        turn: sim.turn,
        round: sim.round,
        scores: [...sim.scores] as [number, number],
        alive: [aliveCount(sim.pieces, 0), aliveCount(sim.pieces, 1)],
      })

    say(`ラウンド ${sim.round}`, `せんこうは ${label(sim.turn)}!`)
    sync()

    /* ---- サイズ調整 ---- */
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const cw = canvas.clientWidth
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(cw * (WORLD.h / WORLD.w) * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    /* ---- 入力 ---- */
    const toWorld = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((e.clientX - rect.left) / rect.width) * WORLD.w,
        y: ((e.clientY - rect.top) / rect.height) * WORLD.h,
      }
    }
    const humanCanAct = () => sim.phase === 'aim' && !isCpuTurn()
    const findOwnPiece = (x: number, y: number) => {
      let best: Piece | null = null
      let bd = Infinity
      for (const p of sim.pieces) {
        if (p.player !== sim.turn || p.state !== 'alive') continue
        const d = Math.hypot(p.x - x, p.y - y)
        if (d < Math.max(p.radius + 12, 38) && d < bd) {
          bd = d
          best = p
        }
      }
      return best
    }
    const onDown = (e: PointerEvent) => {
      if (!humanCanAct()) return
      const { x, y } = toWorld(e)
      const p = findOwnPiece(x, y)
      if (!p) return
      e.preventDefault()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* 合成イベントなどで capture できない環境は無視 */
      }
      sim.drag = { pieceId: p.id, px: x, py: y }
    }
    const onMove = (e: PointerEvent) => {
      if (sim.drag) {
        const { x, y } = toWorld(e)
        sim.drag.px = x
        sim.drag.py = y
        return
      }
      if (!humanCanAct()) {
        canvas.style.cursor = 'default'
        return
      }
      const { x, y } = toWorld(e)
      canvas.style.cursor = findOwnPiece(x, y) ? 'grab' : 'default'
    }
    const fire = (p: Piece, dx: number, dy: number, power: number) => {
      const crit = launchPiece(p, dx, dy, power)
      if (crit) {
        say('クリティカル!!', '2ばいパワー!', '#dc2626')
        sim.flash = reduced ? 0 : 0.4
        for (let i = 0; i < 14; i++) {
          sim.particles.push({
            x: p.x, y: p.y,
            vx: rand(-220, 220), vy: rand(-220, 220),
            life: rand(0.35, 0.6), max: 0.6, size: rand(3, 7),
            color: '#dc2626', kind: 'star', rot: rand(0, 6), vr: rand(-8, 8),
          })
        }
      }
      sim.phase = 'sim'
      sim.simTime = 0
      sim.drag = null
      sim.cpu = null
      sync()
    }
    const onUp = (e: PointerEvent) => {
      if (!sim.drag) return
      const p = sim.pieces.find((q) => q.id === sim.drag!.pieceId)
      const { px, py } = sim.drag
      sim.drag = null
      if (!p || sim.phase !== 'aim') return
      const dx = p.x - px
      const dy = p.y - py
      const power = Math.min(Math.hypot(dx, dy) / MAX_DRAG, 1)
      if (power < 0.12) return // キャンセル扱い
      e.preventDefault()
      fire(p, dx, dy, power)
    }
    const onCtx = (e: Event) => e.preventDefault()
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('contextmenu', onCtx)

    /* ---- イベント処理 ---- */
    const pop = (x: number, y: number, text: string, color: string, size = 21) =>
      sim.pops.push({ x, y, text, life: 0.85, max: 0.85, color, size })

    const processEvents = (events: SimEvent[]) => {
      for (const ev of events) {
        if (ev.type === 'hit') {
          const n = Math.min(4 + Math.floor(ev.strength / 60), 14)
          for (let i = 0; i < (reduced ? 3 : n); i++) {
            sim.particles.push({
              x: ev.x, y: ev.y,
              vx: rand(-260, 260), vy: rand(-260, 260),
              life: rand(0.25, 0.55), max: 0.55, size: rand(2, 5.5),
              color: Math.random() > 0.5 ? '#f97316' : '#facc15',
              kind: 'spark', rot: 0, vr: 0,
            })
          }
          if (ev.strength > 320) {
            pop(ev.x, ev.y - 16, HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)], '#c2410c')
          }
          if (!reduced) sim.shake = Math.min(sim.shake + ev.strength / 90, 9)
        } else if (ev.type === 'wall') {
          pop(ev.x, ev.y - 10, 'コンッ!', '#7c4a21', 17)
          for (let i = 0; i < (reduced ? 2 : 5); i++) {
            sim.particles.push({
              x: ev.x, y: ev.y,
              vx: rand(-150, 150), vy: rand(-150, 150),
              life: rand(0.2, 0.4), max: 0.4, size: rand(2, 4),
              color: '#fbbf24', kind: 'spark', rot: 0, vr: 0,
            })
          }
        } else if (ev.type === 'fall') {
          pop(ev.x, ev.y, 'おっこちた〜!', PLAYER_COLORS[ev.player])
          for (let i = 0; i < (reduced ? 2 : 8); i++) {
            sim.particles.push({
              x: ev.x, y: ev.y,
              vx: rand(-90, 90), vy: rand(-120, -30),
              life: rand(0.4, 0.7), max: 0.7, size: rand(3, 6),
              color: 'rgba(122,90,54,0.7)', kind: 'dust', rot: 0, vr: 0,
            })
          }
          if (!reduced) sim.shake = Math.min(sim.shake + 3, 9)
          sync()
        } else if (ev.type === 'tape') {
          pop(ev.x, ev.y - 14, '🎞️テープでセーフ!', '#1d4ed8')
        } else if (ev.type === 'bounce') {
          pop(ev.x, ev.y - 14, '🌗ビヨーン!', '#7c3aed')
        }
      }
      events.length = 0
    }

    /* ---- ラウンド進行 ---- */
    const startRound = () => {
      sim.round += 1
      sim.starter = (1 - sim.starter) as PlayerId
      sim.turn = sim.starter
      sim.pieces = createRoundPieces(builds)
      sim.charges.protUsed = [false, false]
      sim.particles = []
      sim.pops = []
      sim.phase = 'intro'
      sim.timer = 1.3
      sim.cpu = null
      say(`ラウンド ${sim.round}`, `せんこうは ${label(sim.turn)}!`)
      sync()
    }

    const resolve = () => {
      const a0 = aliveCount(sim.pieces, 0)
      const a1 = aliveCount(sim.pieces, 1)
      if (a0 === 0 || a1 === 0) {
        const winner: PlayerId =
          a0 === 0 && a1 === 0 ? ((1 - sim.turn) as PlayerId) : a0 === 0 ? 1 : 0
        sim.scores[winner] += 1
        if (sim.scores[winner] >= 2) {
          sim.phase = 'matchEnd'
          sim.timer = 1.6
          say(`${label(winner)}の かち!!`, `${sim.scores[0]} - ${sim.scores[1]}`, PLAYER_COLORS[winner])
        } else {
          sim.phase = 'roundEnd'
          sim.timer = 1.9
          say(`${label(winner)}が ラウンドゲット!`, 'つぎのラウンドへ…', PLAYER_COLORS[winner])
        }
      } else {
        sim.turn = (1 - sim.turn) as PlayerId
        sim.phase = 'aim'
        sim.cpu = null
      }
      sync()
    }

    /* ---- CPU ---- */
    const planCpu = () => {
      const mine = sim.pieces.filter((p) => p.player === 1 && p.state === 'alive')
      const foes = sim.pieces.filter((p) => p.player === 0 && p.state === 'alive')
      if (!mine.length || !foes.length) return
      const pick = mine[Math.floor(Math.random() * mine.length)]
      let target = foes[0]
      let bd = Infinity
      for (const f of foes) {
        const d = Math.hypot(f.x - pick.x, f.y - pick.y)
        if (d < bd) { bd = d; target = f }
      }
      sim.cpu = {
        pieceId: pick.id,
        tx: target.x + rand(-22, 22),
        ty: target.y + rand(-22, 22),
        power: rand(0.55, 1),
        t: 0,
      }
    }

    /* ---- 更新 ---- */
    const events: SimEvent[] = []
    const update = (dt: number) => {
      sim.time += dt
      sim.shake *= Math.exp(-5.5 * dt)
      sim.flash = Math.max(0, sim.flash - dt * 2.2)
      // パーティクル / テキスト
      sim.particles = sim.particles.filter((pt) => {
        pt.life -= dt
        pt.x += pt.vx * dt
        pt.y += pt.vy * dt
        pt.vx *= 0.94
        pt.vy = pt.kind === 'dust' ? pt.vy + 160 * dt : pt.vy * 0.94
        pt.rot += pt.vr * dt
        return pt.life > 0
      })
      sim.pops = sim.pops.filter((tp) => {
        tp.life -= dt
        return tp.life > 0
      })

      if (sim.phase === 'intro') {
        sim.timer -= dt
        if (sim.timer <= 0) {
          sim.phase = 'aim'
          sync()
        }
      } else if (sim.phase === 'aim') {
        if (isCpuTurn()) {
          if (!sim.cpu) planCpu()
          else {
            sim.cpu.t += dt
            if (sim.cpu.t > 1.35) {
              const p = sim.pieces.find((q) => q.id === sim.cpu!.pieceId)
              if (p && p.state === 'alive') {
                fire(p, sim.cpu.tx - p.x, sim.cpu.ty - p.y, sim.cpu.power)
              } else sim.cpu = null
            }
          }
        }
      } else if (sim.phase === 'sim') {
        const n = Math.ceil(dt / 0.008)
        const h = dt / n
        for (let i = 0; i < n; i++) stepSim(sim.pieces, h, sim.charges, events, st)
        processEvents(events)
        sim.simTime += dt
        if (sim.simTime > 8) {
          for (const p of sim.pieces) { p.vx = 0; p.vy = 0 }
        }
        if (sim.simTime > 0.15 && allSettled(sim.pieces)) resolve()
      } else if (sim.phase === 'roundEnd') {
        sim.timer -= dt
        if (sim.timer <= 0) startRound()
      } else if (sim.phase === 'matchEnd') {
        sim.timer -= dt
        if (sim.timer <= 0 && !sim.finished) {
          sim.finished = true
          const winner: PlayerId = sim.scores[0] >= 2 ? 0 : 1
          onFinishRef.current(winner, [...sim.scores] as [number, number])
        }
      }
    }

    /* ---- 描画 ---- */
    const draw = () => {
      const s = canvas.width / WORLD.w
      const sx = sim.shake > 0.2 ? (Math.random() - 0.5) * 2 * sim.shake : 0
      const sy = sim.shake > 0.2 ? (Math.random() - 0.5) * 2 * sim.shake : 0
      ctx.setTransform(s, 0, 0, s, sx * s, sy * s)
      drawTable(ctx, st)

      const dragPiece = sim.drag ? sim.pieces.find((q) => q.id === sim.drag!.pieceId) : null
      for (const p of sim.pieces) {
        if (p.state === 'dead') continue
        const active =
          sim.phase === 'aim' && p.player === sim.turn && !isCpuTurn() && p.state === 'alive'
        ctx.globalAlpha = dragPiece && dragPiece.id !== p.id ? 0.75 : 1
        drawEraser(ctx, p, sim.time, active, dragPiece?.id === p.id)
        ctx.globalAlpha = 1
      }

      // ねらい線
      if (dragPiece && sim.drag) {
        drawAim(ctx, dragPiece, sim.drag.px, sim.drag.py, PLAYER_COLORS[sim.turn])
      }
      // CPUのねらい演出
      if (sim.cpu && sim.phase === 'aim') {
        const p = sim.pieces.find((q) => q.id === sim.cpu!.pieceId)
        if (p) {
          const prog = Math.min(sim.cpu.t / 1.35, 1)
          const fakeLen = (55 + sim.cpu.power * 225) * prog
          const dx = sim.cpu.tx - p.x
          const dy = sim.cpu.ty - p.y
          const l = Math.hypot(dx, dy) || 1
          drawAim(
            ctx, p,
            p.x - (dx / l) * Math.min(fakeLen, MAX_DRAG * sim.cpu.power),
            p.y - (dy / l) * Math.min(fakeLen, MAX_DRAG * sim.cpu.power),
            PLAYER_COLORS[1],
          )
        }
      }

      // パーティクル
      for (const pt of sim.particles) {
        const a = Math.max(pt.life / pt.max, 0)
        ctx.globalAlpha = a
        ctx.fillStyle = pt.color
        if (pt.kind === 'star') {
          ctx.save()
          ctx.translate(pt.x, pt.y)
          ctx.rotate(pt.rot)
          ctx.fillRect(-pt.size / 2, -pt.size * 1.5, pt.size, pt.size * 3)
          ctx.fillRect(-pt.size * 1.5, -pt.size / 2, pt.size * 3, pt.size)
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, pt.size * (pt.kind === 'dust' ? a : 1), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      // テキストポップ
      for (const tp of sim.pops) {
        const t = 1 - tp.life / tp.max
        const scale = t < 0.2 ? (t / 0.2) * 1.1 : 1.1 - 0.1 * ((t - 0.2) / 0.8)
        ctx.save()
        ctx.translate(tp.x, tp.y - 42 * t)
        ctx.scale(scale, scale)
        ctx.globalAlpha = tp.life < 0.25 ? tp.life / 0.25 : 1
        ctx.font = `bold ${tp.size}px "Yusei Magic", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.strokeStyle = '#fff7ed'
        ctx.lineWidth = 5
        ctx.strokeText(tp.text, 0, 0)
        ctx.fillStyle = tp.color
        ctx.fillText(tp.text, 0, 0)
        ctx.restore()
      }

      // クリティカルフラッシュ
      if (sim.flash > 0) {
        ctx.fillStyle = `rgba(249,115,22,${sim.flash * 0.45})`
        ctx.fillRect(-20, -20, WORLD.w + 40, WORLD.h + 40)
      }
    }

    /* ---- ループ ---- */
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      update(dt)
      draw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('contextmenu', onCtx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cpuThinking = mode === '1p' && hud.turn === 1 && (hud.phase === 'aim' || hud.phase === 'sim')
  const turnColor = PLAYER_COLORS[hud.turn]
  // 縦長キャンバス: 横幅は「画面の高さに収まる幅」と「100%」の小さい方
  const columnWidth = `min(100%, calc((100dvh - 215px) * ${(WORLD.w / WORLD.h).toFixed(4)}))`

  return (
    <div className="bg-notebook flex min-h-dvh flex-col items-center px-3 py-3 sm:px-6">
      <div className="flex w-full flex-col" style={{ maxWidth: columnWidth, minWidth: 'min(100%, 340px)' }}>
        {/* スコアヘッダー */}
        <header className="flex w-full items-center justify-between gap-2">
          <PlayerChip
            mode={mode}
            player={0}
            alive={hud.alive[0]}
            active={hud.turn === 0 && hud.phase === 'aim'}
          />
          <div className="text-center">
            <p className="font-display text-base leading-none sm:text-lg">
              <span aria-hidden="true">{stage.emoji}</span> ラウンド{' '}
              <span className="font-num text-xl">{hud.round}</span>
            </p>
            <p className="mt-1 font-num text-lg font-bold leading-none tracking-widest" aria-label={`スコア ${hud.scores[0]} 対 ${hud.scores[1]}`}>
              <span style={{ color: PLAYER_COLORS[0] }}>{'★'.repeat(hud.scores[0]) || '☆'}</span>
              <span className="mx-1 text-ink-soft">|</span>
              <span style={{ color: PLAYER_COLORS[1] }}>{'★'.repeat(hud.scores[1]) || '☆'}</span>
            </p>
          </div>
          <PlayerChip
            mode={mode}
            player={1}
            alive={hud.alive[1]}
            active={hud.turn === 1 && hud.phase === 'aim'}
          />
        </header>

        {/* バトルキャンバス */}
        <div className="relative mt-2 w-full">
          <div className="sketch overflow-hidden bg-paper shadow-sketch">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`ステージ「${stage.name}」のバトルの机。自分の消しゴムをドラッグして引っぱり、はなすと発射します。`}
              className="w-full"
              style={{ aspectRatio: `${WORLD.w} / ${WORLD.h}` }}
            />
          </div>

          {/* ターンバナー */}
          <div className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${hud.turn}-${hud.phase === 'aim'}-${cpuThinking}`}
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                className="sketch-alt whitespace-nowrap px-4 py-1.5 font-display text-sm text-white shadow-sketch-sm sm:text-base"
                style={{ background: turnColor }}
              >
                {cpuThinking
                  ? 'CPU かんがえちゅう…🤖'
                  : hud.phase === 'aim'
                    ? `▼ ${playerLabel(mode, hud.turn)}のターン`
                    : `${playerLabel(mode, hud.turn)}の いっぱつ!`}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* センターアナウンス */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <AnimatePresence>
              {announce && (
                <motion.div
                  key={announce.id}
                  role="status"
                  initial={{ scale: 0.4, opacity: 0, rotate: -6 }}
                  animate={{ scale: 1, opacity: 1, rotate: -2 }}
                  exit={{ scale: 1.15, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 17 }}
                  className="sketch bg-white px-8 py-5 text-center shadow-sketch"
                >
                  <p
                    className="font-display text-3xl sm:text-4xl"
                    style={{ color: announce.color ?? 'var(--color-ink)' }}
                  >
                    {announce.title}
                  </p>
                  {announce.sub && (
                    <p className="mt-1 font-display text-base text-ink-soft">{announce.sub}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* フッター */}
        <div className="mt-2 flex w-full items-center justify-between gap-3">
          <SketchButton variant="ghost" onClick={onExit} className="!min-h-11 !px-3 text-sm">
            ← タイトル
          </SketchButton>
          <p className="text-right text-[11px] font-bold leading-snug text-ink-soft sm:text-xs">
            ✌️ ひっぱって はなすと発射!
            <br className="sm:hidden" />
            ふちから おとされたら まけ
          </p>
        </div>
      </div>
    </div>
  )
}

function PlayerChip({
  mode,
  player,
  alive,
  active,
}: {
  mode: Mode
  player: PlayerId
  alive: number
  active: boolean
}) {
  const color = PLAYER_COLORS[player]
  return (
    <motion.div
      animate={active ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={active ? { duration: 1.4, repeat: Infinity } : undefined}
      className={cx('sketch bg-white px-3 py-2 shadow-sketch-sm sm:px-4')}
      style={active ? { boxShadow: `0 0 0 3px ${color}, 2px 3px 0 rgba(66,32,6,.75)` } : undefined}
    >
      <p className="font-display text-sm leading-none sm:text-base" style={{ color }}>
        {playerLabel(mode, player)}
      </p>
      <div className="mt-1.5 flex gap-1.5" aria-label={`のこり ${alive} こ`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="flex h-4 w-6 items-center justify-center rounded-[3px] border-2 border-ink/60 text-[9px] font-bold leading-none text-ink/50"
            style={{ background: i < alive ? color : 'rgba(66,32,6,0.12)' }}
          >
            {i >= alive && '✕'}
          </span>
        ))}
      </div>
    </motion.div>
  )
}
