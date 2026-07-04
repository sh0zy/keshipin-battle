// バトル画面: 木目の机 + パチンコ式ドラッグ + ステージギミック + サドンデス + 効果音
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CPU_LEVEL_LABEL,
  PLAYER_COLORS,
  computeBuild,
  gearById,
  playerLabel,
  type Build,
  type CpuLevel,
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
import { playBgm, sfx } from '../game/sound'
import { MuteButton, SketchButton, cx } from '../components/ui'

type Phase = 'intro' | 'aim' | 'sim' | 'roundEnd' | 'matchEnd'

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; size: number; color: string
  kind: 'spark' | 'dust' | 'star'; rot: number; vr: number
}
interface TextPop { x: number; y: number; text: string; life: number; max: number; color: string; size: number }

interface Sim {
  pieces: Piece[]
  builds: Build[]
  charges: Charges
  particles: Particle[]
  pops: TextPop[]
  shake: number
  flash: number
  phase: Phase
  turn: PlayerId
  round: number
  starter: PlayerId
  scores: number[]
  timer: number
  simTime: number
  time: number
  flicks: number // このラウンドで弾いた回数 (サドンデス用)
  shrink: number // 落下ラインの縮み幅
  teacher: TeacherState
  teacherT: number
  footTimer: number
  gimmickT: number // 回転コンパス/かたむきの時計 (sim中だけ進む)
  drag: { pieceId: number; px: number; py: number } | null
  cpu: { pieceId: number; tx: number; ty: number; power: number; t: number; dur: number } | null
  finished: boolean
}

interface Hud {
  phase: Phase
  turn: PlayerId
  round: number
  scores: number[]
  alive: number[]
  shrinking: boolean
  teacher: TeacherState
}
interface Announce { id: number; title: string; sub?: string; color?: string }

const HIT_WORDS = ['ゴンッ!', 'パチンッ!', 'ドカッ!']
const rand = (a: number, b: number) => a + Math.random() * (b - a)

// サドンデス: 10回目の一撃から毎ターン縮む
const SHRINK_START_FLICKS = 10
const SHRINK_STEP = 24
const SHRINK_MAX = 190

// 先生が来た!: 8回周期 (6回目=あしおと予告 / 7・8回目=監視でパワー50%制限)
const TEACHER_CAP = 0.5
type TeacherState = 'none' | 'warn' | 'watch'
function teacherState(flickNo: number): TeacherState {
  const c = ((flickNo - 1) % 8) + 1
  if (c === 6) return 'warn'
  if (c >= 7) return 'watch'
  return 'none'
}

// エモート吹き出し
const EMOTES = [
  { emoji: '😎', text: 'よゆう〜' },
  { emoji: '💦', text: 'まって!!' },
  { emoji: '😱', text: 'うそでしょ!?' },
  { emoji: '🔥', text: 'ここからだ!' },
  { emoji: '👏', text: 'ナイス!' },
] as const
type Emote = (typeof EMOTES)[number]
interface EmoteMsg {
  id: number
  emoji: string
  text: string
}

/* ---------------- 木目テクスチャ (1回だけ生成してキャッシュ) ---------------- */
// 800 = 大型丸テーブル(直径800)にも足りるサイズ
const WOOD_W = 800
const WOOD_H = 800
let woodCache: HTMLCanvasElement | null = null
function getWood(): HTMLCanvasElement {
  if (woodCache) return woodCache
  const c = document.createElement('canvas')
  c.width = WOOD_W
  c.height = WOOD_H
  const g = c.getContext('2d')!
  const rows = 8
  const ph = WOOD_H / rows
  const lights = [61, 57, 60, 63, 56, 59, 62, 58]
  for (let r = 0; r < rows; r++) {
    g.fillStyle = `hsl(31 45% ${lights[r]}%)`
    g.fillRect(0, r * ph, WOOD_W, ph)
    const grad = g.createLinearGradient(0, r * ph, 0, r * ph + ph)
    grad.addColorStop(0, 'rgba(255,240,220,0.14)')
    grad.addColorStop(1, 'rgba(90,50,20,0.10)')
    g.fillStyle = grad
    g.fillRect(0, r * ph, WOOD_W, ph)
    for (let i = 0; i < 8; i++) {
      const y0 = r * ph + rand(4, ph - 4)
      g.beginPath()
      g.moveTo(0, y0)
      for (let x = 0; x <= WOOD_W; x += 55) {
        g.quadraticCurveTo(x + 27, y0 + rand(-4, 4), x + 55, y0 + rand(-2.5, 2.5))
      }
      g.strokeStyle = `rgba(120,66,28,${rand(0.07, 0.16)})`
      g.lineWidth = rand(0.7, 1.9)
      g.stroke()
    }
    for (let i = 0; i < 2; i++) {
      const kx = rand(30, WOOD_W - 30)
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
    g.fillRect(0, r * ph - 1, WOOD_W, 2)
  }
  woodCache = c
  return c
}

// サドンデスの危険ゾーン用ストライプ
let stripeCache: HTMLCanvasElement | null = null
function getStripes(g: CanvasRenderingContext2D): CanvasPattern | null {
  if (!stripeCache) {
    stripeCache = document.createElement('canvas')
    stripeCache.width = 12
    stripeCache.height = 12
    const p = stripeCache.getContext('2d')!
    p.strokeStyle = 'rgba(225,29,72,0.35)'
    p.lineWidth = 3
    p.beginPath()
    p.moveTo(-4, 16)
    p.lineTo(16, -4)
    p.moveTo(-4 + 12, 16)
    p.lineTo(16 + 12, -4)
    p.stroke()
  }
  return g.createPattern(stripeCache, 'repeat')
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

function drawPencilWall(g: CanvasRenderingContext2D, w: Wall) {
  const tipH = 30
  const bandH = 10
  const eraserH = 16
  roundRectPath(g, w.x, w.y + tipH, w.w, w.h - tipH - bandH - eraserH, 3)
  g.fillStyle = '#fbbf24'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.4
  g.stroke()
  g.strokeStyle = 'rgba(66,32,6,0.18)'
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(w.x + w.w * 0.34, w.y + tipH + 2)
  g.lineTo(w.x + w.w * 0.34, w.y + w.h - bandH - eraserH - 2)
  g.moveTo(w.x + w.w * 0.66, w.y + tipH + 2)
  g.lineTo(w.x + w.w * 0.66, w.y + w.h - bandH - eraserH - 2)
  g.stroke()
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
  const tagW = Math.min(52, w.w - 24)
  roundRectPath(g, w.x + 12, w.y + w.h - 28, tagW, 16, 4)
  g.fillStyle = '#fff7ed'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 1.5
  g.stroke()
  g.strokeStyle = 'rgba(66,32,6,0.35)'
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(w.x + 16, w.y + w.h - 20)
  g.lineTo(w.x + 8 + tagW, w.y + w.h - 20)
  g.stroke()
}

function drawHole(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = '#2b2350'
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
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

// 回転コンパス (見た目)
function drawSpinner(g: CanvasRenderingContext2D, stage: Stage, t: number) {
  const sp = stage.spinner
  if (!sp) return
  g.save()
  g.translate(sp.x, sp.y)
  g.rotate(t * sp.speed)
  // 影
  g.strokeStyle = 'rgba(66,32,6,0.2)'
  g.lineWidth = sp.radius * 2 + 4
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(-sp.length + 3, 5)
  g.lineTo(sp.length + 3, 5)
  g.stroke()
  // 針 (ふち + 金属)
  g.strokeStyle = '#422006'
  g.lineWidth = sp.radius * 2
  g.beginPath()
  g.moveTo(-sp.length, 0)
  g.lineTo(sp.length, 0)
  g.stroke()
  g.strokeStyle = '#a8b6c8'
  g.lineWidth = sp.radius * 2 - 5
  g.beginPath()
  g.moveTo(-sp.length + 2, 0)
  g.lineTo(sp.length - 2, 0)
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.45)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(-sp.length + 8, -3)
  g.lineTo(sp.length - 8, -3)
  g.stroke()
  // 右はし: 鉛筆
  g.fillStyle = '#fbbf24'
  g.strokeStyle = '#422006'
  g.lineWidth = 2
  g.fillRect(sp.length - 38, -7, 28, 14)
  g.strokeRect(sp.length - 38, -7, 28, 14)
  g.beginPath()
  g.moveTo(sp.length - 10, -7)
  g.lineTo(sp.length + 6, 0)
  g.lineTo(sp.length - 10, 7)
  g.closePath()
  g.fillStyle = '#e7c496'
  g.fill()
  g.stroke()
  // 左はし: 針さき
  g.beginPath()
  g.moveTo(-sp.length + 12, -5)
  g.lineTo(-sp.length - 8, 0)
  g.lineTo(-sp.length + 12, 5)
  g.closePath()
  g.fillStyle = '#64748b'
  g.fill()
  g.stroke()
  // ピボット (ねじ)
  g.beginPath()
  g.arc(0, 0, 13, 0, Math.PI * 2)
  g.fillStyle = '#e2e8f0'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.5
  g.stroke()
  g.beginPath()
  g.arc(0, 0, 4.5, 0, Math.PI * 2)
  g.fillStyle = '#94a3b8'
  g.fill()
  g.restore()
}

// かたむき: 流れの方向インジケータ
function drawTiltArrow(g: CanvasRenderingContext2D, stage: Stage, t: number) {
  if (!stage.tilt) return
  const dir = (t / stage.tilt.period) * Math.PI * 2
  g.save()
  g.translate(DESK.x + DESK.w / 2, DESK.y + DESK.h / 2)
  g.rotate(dir)
  g.globalAlpha = 0.3
  g.strokeStyle = '#5a3a16'
  g.lineWidth = 6
  g.setLineDash([14, 10])
  g.beginPath()
  g.moveTo(-52, 0)
  g.lineTo(44, 0)
  g.stroke()
  g.setLineDash([])
  g.fillStyle = '#5a3a16'
  g.beginPath()
  g.moveTo(66, 0)
  g.lineTo(40, -12)
  g.lineTo(40, 12)
  g.closePath()
  g.fill()
  g.restore()
  g.save()
  g.globalAlpha = 0.5
  g.fillStyle = '#5a3a16'
  g.font = 'bold 15px "Yusei Magic", sans-serif'
  g.textAlign = 'center'
  g.fillText('ながれ', DESK.x + DESK.w / 2, DESK.y + DESK.h / 2 + 34)
  g.restore()
}

// 丸テーブルの描画
function drawRoundDesk(
  g: CanvasRenderingContext2D,
  round: { x: number; y: number; r: number },
  shrink: number,
  worldW: number,
) {
  const { x, y, r } = round
  // 影
  g.fillStyle = 'rgba(66,32,6,0.15)'
  g.beginPath()
  g.arc(x + 9, y + 13, r, 0, Math.PI * 2)
  g.fill()
  // 木目
  g.save()
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.clip()
  g.drawImage(getWood(), x - r, y - r)
  g.strokeStyle = 'rgba(60,30,8,0.22)'
  g.lineWidth = 16
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.stroke()
  // サドンデスの危険ゾーン (外周リング)
  if (shrink > 0) {
    const inner = Math.max(r - shrink, 1)
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.arc(x, y, inner, 0, Math.PI * 2, true)
    g.fillStyle = 'rgba(225,29,72,0.12)'
    g.fill()
    const pat = getStripes(g)
    if (pat) {
      g.fillStyle = pat
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.arc(x, y, inner, 0, Math.PI * 2, true)
      g.fill()
    }
  }
  g.restore()
  // ふち
  g.strokeStyle = '#7c4a21'
  g.lineWidth = 7
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.stroke()
  // 落下警告の点線 (縮んだラインに追従)
  g.strokeStyle = shrink > 0 ? 'rgba(220,38,38,0.45)' : 'rgba(66,32,6,0.22)'
  g.lineWidth = 2.5
  g.setLineDash([12, 10])
  g.beginPath()
  g.arc(x, y, Math.max(r - Math.max(24, shrink), 10), 0, Math.PI * 2)
  g.stroke()
  g.setLineDash([])
  // あいた紙スペースのらくがき
  g.strokeStyle = 'rgba(66,32,6,0.10)'
  g.lineWidth = 2
  g.beginPath()
  g.arc(70, 110, 16, 0.3, Math.PI * 1.7)
  g.arc(98, 118, 10, Math.PI, Math.PI * 2.6)
  g.stroke()
  g.beginPath()
  g.arc(worldW - 80, 120, 14, 1.2, Math.PI * 2.5)
  g.stroke()
}

function drawTable(
  g: CanvasRenderingContext2D,
  stage: Stage,
  shrink: number,
  gimmickT: number,
  worldW = WORLD.w,
  worldH = WORLD.h,
) {
  // ノートの紙 + 罫線
  g.fillStyle = '#fff7ed'
  g.fillRect(0, 0, worldW, worldH)
  g.fillStyle = 'rgba(37,99,235,0.08)'
  for (let y = 34; y < worldH; y += 34) g.fillRect(0, y, worldW, 2)
  g.fillStyle = 'rgba(225,29,72,0.16)'
  g.fillRect(30, 0, 2, worldH)
  if (stage.round) {
    drawRoundDesk(g, stage.round, shrink, worldW)
  } else {
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
    // サドンデスの危険ゾーン
    if (shrink > 0) {
      const zones: [number, number, number, number][] = []
      if (stage.openEdges.left) zones.push([DESK.x, DESK.y, shrink, DESK.h])
      if (stage.openEdges.right) zones.push([DESK.x + DESK.w - shrink, DESK.y, shrink, DESK.h])
      if (stage.openEdges.top) zones.push([DESK.x, DESK.y, DESK.w, shrink])
      if (stage.openEdges.bottom) zones.push([DESK.x, DESK.y + DESK.h - shrink, DESK.w, shrink])
      g.fillStyle = 'rgba(225,29,72,0.12)'
      for (const [x, y, w, h] of zones) g.fillRect(x, y, w, h)
      const pat = getStripes(g)
      if (pat) {
        g.fillStyle = pat
        for (const [x, y, w, h] of zones) g.fillRect(x, y, w, h)
      }
    }
    g.restore()
    // 机のふち
    g.strokeStyle = '#7c4a21'
    g.lineWidth = 7
    roundRectPath(g, DESK.x, DESK.y, DESK.w, DESK.h, 18)
    g.stroke()
    // 落下警告の点線 (開いているふちは縮んだラインに追従)
    const iL = DESK.x + (stage.openEdges.left ? Math.max(24, shrink) : 24)
    const iR = DESK.x + DESK.w - (stage.openEdges.right ? Math.max(24, shrink) : 24)
    const iT = DESK.y + (stage.openEdges.top ? Math.max(24, shrink) : 24)
    const iB = DESK.y + DESK.h - (stage.openEdges.bottom ? Math.max(24, shrink) : 24)
    g.strokeStyle = shrink > 0 ? 'rgba(220,38,38,0.45)' : 'rgba(66,32,6,0.22)'
    g.lineWidth = 2.5
    g.setLineDash([12, 10])
    g.beginPath()
    if (stage.openEdges.top) { g.moveTo(iL, iT); g.lineTo(iR, iT) }
    if (stage.openEdges.bottom) { g.moveTo(iL, iB); g.lineTo(iR, iB) }
    if (stage.openEdges.left) { g.moveTo(iL, iT); g.lineTo(iL, iB) }
    if (stage.openEdges.right) { g.moveTo(iR, iT); g.lineTo(iR, iB) }
    g.stroke()
    g.setLineDash([])
  }
  // ステージギミック
  drawTiltArrow(g, stage, gimmickT)
  for (const h of stage.holes) drawHole(g, h.x, h.y, h.r)
  for (const w of stage.walls) {
    if (w.kind === 'pencil') drawPencilWall(g, w)
    else drawCaseWall(g, w)
  }
  drawSpinner(g, stage, gimmickT)
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
  if (p.state === 'alive') {
    g.fillStyle = 'rgba(66,32,6,0.18)'
    g.beginPath()
    g.ellipse(p.x + 3, p.y + 5, r * 1.06, r * 0.74, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.translate(p.x, p.y)
  g.rotate(p.angle)
  roundRectPath(g, -w / 2, -h / 2, w, h, 7)
  g.fillStyle = '#fbf3e4'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.6
  g.stroke()
  g.fillStyle = 'rgba(66,32,6,0.07)'
  roundRectPath(g, -w / 2 + 2, 2, w - 4, h / 2 - 4, 5)
  g.fill()
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
  g.fillStyle = 'white'
  g.font = `bold ${r * 0.72}px Kalam, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(p.player + 1), 0, 1)
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

function drawAim(g: CanvasRenderingContext2D, p: Piece, px: number, py: number, color: string, cap = 1) {
  const dx = p.x - px
  const dy = p.y - py
  const len = Math.hypot(dx, dy)
  const rawPower = Math.min(len / MAX_DRAG, 1)
  const power = Math.min(rawPower, cap)
  const capped = cap < 1 && rawPower > cap
  if (len < 4) return
  const nx = dx / len
  const ny = dy / len
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
  const hue = 120 - power * 120
  g.strokeStyle = `hsl(${hue} 85% 42%)`
  g.lineWidth = 5.5
  g.beginPath()
  g.arc(p.x, p.y, p.radius + 15, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2)
  g.stroke()
  g.fillStyle = capped ? '#dc2626' : '#422006'
  g.font = 'bold 17px Kalam, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.strokeStyle = '#fff7ed'
  g.lineWidth = 4
  const label = capped ? `${Math.round(power * 100)}%👀` : `${Math.round(power * 100)}%`
  g.strokeText(label, p.x, p.y - p.radius - 28)
  g.fillText(label, p.x, p.y - p.radius - 28)
}

// 先生 (監視中に上からのぞきこむ / 目線は現在の駒を追う)
function drawTeacher(g: CanvasRenderingContext2D, t: number, lookX: number, lookY: number, deskTop = DESK.y, worldW = WORLD.w) {
  const slide = Math.min(t / 0.35, 1)
  const ease = 1 - (1 - slide) * (1 - slide)
  const hx = worldW / 2
  const hy = deskTop - 136 + 100 * ease
  // 手 (机のふちを つかむ)
  if (ease > 0.85) {
    g.fillStyle = '#f8d3ac'
    g.strokeStyle = '#422006'
    g.lineWidth = 2.2
    for (const ox of [-34, 34]) {
      g.beginPath()
      g.ellipse(hx + ox, deskTop - 6, 10, 7, 0, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
  }
  // 頭
  g.beginPath()
  g.arc(hx, hy, 26, 0, Math.PI * 2)
  g.fillStyle = '#f8d3ac'
  g.fill()
  g.strokeStyle = '#422006'
  g.lineWidth = 2.5
  g.stroke()
  // かみの毛
  g.beginPath()
  g.arc(hx, hy - 4, 25, Math.PI * 1.02, Math.PI * 1.98)
  g.fillStyle = '#4a3626'
  g.fill()
  // メガネ + 目線
  const px = Math.max(-3, Math.min(3, (lookX - hx) / 60))
  const py = Math.max(-1, Math.min(3, (lookY - hy) / 90))
  for (const ox of [-11, 11]) {
    g.beginPath()
    g.arc(hx + ox, hy + 3, 8, 0, Math.PI * 2)
    g.fillStyle = 'white'
    g.fill()
    g.strokeStyle = '#422006'
    g.lineWidth = 2
    g.stroke()
    g.beginPath()
    g.arc(hx + ox + px, hy + 3 + py, 2.2, 0, Math.PI * 2)
    g.fillStyle = '#422006'
    g.fill()
  }
  g.strokeStyle = '#422006'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(hx - 3, hy + 3)
  g.lineTo(hx + 3, hy + 3)
  g.stroke()
  // きびしい まゆげ + 口
  g.lineWidth = 2.5
  g.beginPath()
  g.moveTo(hx - 17, hy - 8)
  g.lineTo(hx - 5, hy - 5)
  g.moveTo(hx + 17, hy - 8)
  g.lineTo(hx + 5, hy - 5)
  g.stroke()
  g.beginPath()
  g.moveTo(hx - 6, hy + 17)
  g.lineTo(hx + 6, hy + 17)
  g.stroke()
}

/* ================================================================ */
export default function BattleScreen({
  mode,
  cpuLevel = 'normal',
  stage,
  loadouts,
  onFinish,
  onExit,
}: {
  mode: Mode
  cpuLevel?: CpuLevel
  stage: Stage
  loadouts: string[][]
  onFinish: (winner: PlayerId, score: number[]) => void
  onExit: () => void
}) {
  const nPlayers = loadouts.length
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Sim | null>(null)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  const stageRef = useRef(stage)
  stageRef.current = stage

  const [hud, setHud] = useState<Hud>(() => ({
    phase: 'intro',
    turn: 0,
    round: 1,
    scores: loadouts.map(() => 0),
    alive: loadouts.map(() => 3),
    shrinking: false,
    teacher: 'none',
  }))
  const [announce, setAnnounce] = useState<Announce | null>(null)
  const [emotes, setEmotes] = useState<Record<PlayerId, EmoteMsg | null>>({ 0: null, 1: null, 2: null })
  const emoteSeq = useRef(0)
  const sendEmote = (player: PlayerId, e: Emote) => {
    sfx.emote()
    const id = ++emoteSeq.current
    setEmotes((prev) => ({ ...prev, [player]: { id, emoji: e.emoji, text: e.text } }))
    window.setTimeout(() => {
      setEmotes((prev) => (prev[player]?.id === id ? { ...prev, [player]: null } : prev))
    }, 2400)
  }
  const sendEmoteRef = useRef(sendEmote)
  sendEmoteRef.current = sendEmote

  useEffect(() => {
    if (!announce) return
    const t = setTimeout(() => setAnnounce(null), 1500)
    return () => clearTimeout(t)
  }, [announce])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const builds: Build[] = loadouts.map((l) => computeBuild(l))
    const st = stageRef.current
    const wld = st.world ?? WORLD
    let announceId = 0
    let lastHitSfx = 0

    const sim: Sim = {
      pieces: createRoundPieces(builds, nPlayers, st),
      builds,
      charges: {
        tapeUsed: Array(nPlayers).fill(false),
        protUsed: Array(nPlayers).fill(false),
      },
      particles: [],
      pops: [],
      shake: 0,
      flash: 0,
      phase: 'intro',
      turn: 0,
      round: 1,
      starter: 0,
      scores: loadouts.map(() => 0),
      timer: 1.3,
      simTime: 0,
      time: 0,
      flicks: 0,
      shrink: 0,
      teacher: 'none',
      teacherT: 0,
      footTimer: 0,
      gimmickT: 0,
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
        scores: [...sim.scores],
        alive: builds.map((_, i) => aliveCount(sim.pieces, i as PlayerId)),
        shrinking: sim.shrink > 0,
        teacher: sim.teacher,
      })

    // 先生イベント: つぎの一撃の状態に切り替え + アナウンス
    const updateTeacher = () => {
      const next = teacherState(sim.flicks + 1)
      if (next === sim.teacher) return
      if (next === 'warn') {
        sfx.knock()
        say('コツコツ…', 'ろうかから せんせいの あしおと!', '#92400e')
      } else if (next === 'watch') {
        sfx.teacher()
        say('先生が来た!', 'パワー50%までしか 出せない!', '#92400e')
      } else if (sim.teacher === 'watch') {
        sfx.relief()
        say('先生は行った!', 'いまだ、全力しょうぶ!!', '#16a34a')
      }
      sim.teacher = next
      sim.teacherT = 0
      sim.footTimer = 0
    }

    say(`ラウンド ${sim.round}`, `せんこうは ${label(sim.turn)}!`)
    sync()

    /* ---- サイズ調整 ---- */
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const cw = canvas.clientWidth
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(cw * (wld.h / wld.w) * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    /* ---- 入力 ---- */
    const toWorld = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((e.clientX - rect.left) / rect.width) * wld.w,
        y: ((e.clientY - rect.top) / rect.height) * wld.h,
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
      // まけんき補正: のこり1個の側は +15%
      const boost = aliveCount(sim.pieces, p.player) === 1 ? 1.15 : 1
      const crit = launchPiece(p, dx, dy, power, boost)
      if (boost > 1) pop(p.x, p.y - p.radius - 16, '🔥まけんき +15%!', '#ea580c', 18)
      sim.flicks += 1
      sfx.launch(power)
      if (crit) {
        sfx.crit()
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
      const cap = sim.teacher === 'watch' ? TEACHER_CAP : 1
      const power = Math.min(Math.hypot(dx, dy) / MAX_DRAG, cap)
      if (power < 0.12) return
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
          if (sim.time - lastHitSfx > 0.06) {
            sfx.hit(ev.strength)
            lastHitSfx = sim.time
          }
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
          sfx.wall()
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
          sfx.fall()
          pop(ev.x, ev.y, 'おっこちた〜!', PLAYER_COLORS[ev.player])
          if (mode === '1p' && ev.player === 1) sendEmoteRef.current(1, EMOTES[2])
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
          sfx.tape()
          pop(ev.x, ev.y - 14, '🎞️テープでセーフ!', '#1d4ed8')
        } else if (ev.type === 'bounce') {
          sfx.bounce()
          pop(ev.x, ev.y - 14, '🌗ビヨーン!', '#7c3aed')
        }
      }
      events.length = 0
    }

    /* ---- サドンデス: 机がちぢむ ---- */
    const maybeShrink = () => {
      const target = Math.min(
        Math.max(0, sim.flicks - (SHRINK_START_FLICKS - 1)) * SHRINK_STEP,
        SHRINK_MAX,
      )
      if (target <= sim.shrink) return false
      const first = sim.shrink === 0
      sim.shrink = target
      sfx.shrink()
      playBgm('danger')
      if (!reduced) sim.shake = Math.min(sim.shake + 4, 9)
      if (first) say('サドンデス!', 'つくえが ちぢんでいく…!', '#dc2626')
      else {
        const topY = st.round ? st.round.y - st.round.r : DESK.y
        pop(st.round ? st.round.x : DESK.x + DESK.w / 2, topY + sim.shrink + 26, 'まだ ちぢむ!', '#dc2626', 18)
      }
      sync()
      return true
    }

    /* ---- ラウンド進行 ---- */
    const startRound = () => {
      sim.round += 1
      sim.starter = ((sim.starter + 1) % nPlayers) as PlayerId
      sim.turn = sim.starter
      // 席ローテーション: ラウンドごとに じんちを交代
      sim.pieces = createRoundPieces(builds, nPlayers, st, (sim.round - 1) % nPlayers)
      sim.charges.protUsed = Array(nPlayers).fill(false)
      sim.particles = []
      sim.pops = []
      sim.phase = 'intro'
      sim.timer = 1.3
      sim.cpu = null
      sim.flicks = 0
      sim.shrink = 0
      sim.teacher = 'none'
      sim.teacherT = 0
      playBgm('battle')
      say(`ラウンド ${sim.round}`, `せんこうは ${label(sim.turn)}!`)
      sync()
    }

    const resolve = () => {
      const counts = builds.map((_, i) => aliveCount(sim.pieces, i as PlayerId))
      const survivors = counts.filter((c) => c > 0).length
      if (survivors <= 1) {
        // 生き残りがラウンド勝者 (全滅なら次番のプレイヤー)
        const found = counts.findIndex((c) => c > 0)
        const winner = (found >= 0 ? found : (sim.turn + 1) % nPlayers) as PlayerId
        sim.scores[winner] += 1
        sfx.round()
        if (mode === '1p') {
          window.setTimeout(() => sendEmoteRef.current(1, winner === 1 ? EMOTES[0] : EMOTES[1]), 500)
        }
        if (sim.scores[winner] >= 2) {
          sim.phase = 'matchEnd'
          sim.timer = 1.6
          say(`${label(winner)}の かち!!`, sim.scores.join(' - '), PLAYER_COLORS[winner])
        } else {
          sim.phase = 'roundEnd'
          sim.timer = 1.9
          say(`${label(winner)}が ラウンドゲット!`, 'つぎのラウンドへ…', PLAYER_COLORS[winner])
        }
      } else {
        // つぎの生きているプレイヤーへ (全滅プレイヤーはスキップ)
        do {
          sim.turn = ((sim.turn + 1) % nPlayers) as PlayerId
        } while (counts[sim.turn] === 0)
        sim.phase = 'aim'
        sim.cpu = null
        updateTeacher()
      }
      sync()
    }

    /* ---- CPU ---- */
    // 発射経路が壁や穴にかかるか (つよいCPUの回避判定)
    const pathBlocked = (x0: number, y0: number, x1: number, y1: number, rad: number) => {
      const d = Math.hypot(x1 - x0, y1 - y0)
      const steps = Math.max(2, Math.ceil(d / 24))
      for (let i = 1; i < steps; i++) {
        const x = x0 + ((x1 - x0) * i) / steps
        const y = y0 + ((y1 - y0) * i) / steps
        for (const w of st.walls) {
          if (x > w.x - rad && x < w.x + w.w + rad && y > w.y - rad && y < w.y + w.h + rad) return true
        }
        for (const h of st.holes) {
          if (Math.hypot(x - h.x, y - h.y) < h.r * 0.9) return true
        }
      }
      return false
    }
    // その方向に飛ばしたとき、開いたふちまでの距離 (短い = 落としやすい)
    const openEdgeDistAlong = (x: number, y: number, dx: number, dy: number) => {
      if (st.round) {
        // 円のふちまでの距離 (レイと円の交点)
        const R = st.round.r - sim.shrink
        const px2 = x - st.round.x
        const py2 = y - st.round.y
        const b = px2 * dx + py2 * dy
        const c2 = px2 * px2 + py2 * py2 - R * R
        const disc = b * b - c2
        if (disc <= 0) return 0
        return -b + Math.sqrt(disc)
      }
      const bx0 = DESK.x + (st.openEdges.left ? sim.shrink : 0)
      const bx1 = DESK.x + DESK.w - (st.openEdges.right ? sim.shrink : 0)
      const by0 = DESK.y + (st.openEdges.top ? sim.shrink : 0)
      const by1 = DESK.y + DESK.h - (st.openEdges.bottom ? sim.shrink : 0)
      let t = Infinity
      if (st.openEdges.left && dx < -1e-6) t = Math.min(t, (x - bx0) / -dx)
      if (st.openEdges.right && dx > 1e-6) t = Math.min(t, (bx1 - x) / dx)
      if (st.openEdges.top && dy < -1e-6) t = Math.min(t, (y - by0) / -dy)
      if (st.openEdges.bottom && dy > 1e-6) t = Math.min(t, (by1 - y) / dy)
      return t
    }

    const planCpu = () => {
      const mine = sim.pieces.filter((p) => p.player === 1 && p.state === 'alive')
      const foes = sim.pieces.filter((p) => p.player === 0 && p.state === 'alive')
      if (!mine.length || !foes.length) return
      const dur = cpuLevel === 'easy' ? 1.5 : cpuLevel === 'hard' ? 1.15 : 1.35

      if (cpuLevel === 'hard') {
        let best: { p: Piece; tx: number; ty: number; power: number; score: number } | null = null
        for (const m of mine) {
          for (const f of foes) {
            const d = Math.hypot(f.x - m.x, f.y - m.y) || 1
            const dx = (f.x - m.x) / d
            const dy = (f.y - m.y) / d
            const push = openEdgeDistAlong(f.x, f.y, dx, dy)
            const blocked = pathBlocked(m.x, m.y, f.x, f.y, m.radius)
            const score =
              900 - (Number.isFinite(push) ? push : 900) * 1.4 - d * 0.4 - (blocked ? 700 : 0)
            if (!best || score > best.score) {
              const power = Math.min(1, Math.max(0.55, d / 430 + (push < 160 ? 0.5 : 0.3)))
              best = {
                p: m,
                tx: f.x + rand(-8, 8),
                ty: f.y + rand(-8, 8),
                power,
                score,
              }
            }
          }
        }
        if (best) {
          sim.cpu = { pieceId: best.p.id, tx: best.tx, ty: best.ty, power: best.power, t: 0, dur }
          return
        }
      }

      // よわい / ふつう: いちばん近い敵をねらう
      const pick = mine[Math.floor(Math.random() * mine.length)]
      let target = foes[0]
      let bd = Infinity
      for (const f of foes) {
        const d = Math.hypot(f.x - pick.x, f.y - pick.y)
        if (d < bd) { bd = d; target = f }
      }
      const noise = cpuLevel === 'easy' ? 48 : 22
      const power = cpuLevel === 'easy' ? rand(0.4, 0.85) : rand(0.55, 1)
      sim.cpu = {
        pieceId: pick.id,
        tx: target.x + rand(-noise, noise),
        ty: target.y + rand(-noise, noise),
        power,
        t: 0,
        dur,
      }
    }

    /* ---- 更新 ---- */
    const events: SimEvent[] = []
    const update = (dt: number) => {
      sim.time += dt
      sim.shake *= Math.exp(-5.5 * dt)
      sim.flash = Math.max(0, sim.flash - dt * 2.2)
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

      // 先生イベントの経過時間 + あしおと演出
      sim.teacherT += dt
      if (sim.teacher === 'warn' && sim.phase === 'aim') {
        sim.footTimer -= dt
        if (sim.footTimer <= 0) {
          sim.footTimer = 0.75
          pop(rand(80, 210), rand(24, 46), 'コツ…', 'rgba(122,90,54,0.9)', 15)
        }
      }

      if (sim.phase === 'intro') {
        sim.timer -= dt
        if (sim.timer <= 0) {
          sim.phase = 'aim'
          updateTeacher()
          sync()
        }
      } else if (sim.phase === 'aim') {
        if (isCpuTurn()) {
          if (!sim.cpu) planCpu()
          else {
            sim.cpu.t += dt
            if (sim.cpu.t > sim.cpu.dur) {
              const p = sim.pieces.find((q) => q.id === sim.cpu!.pieceId)
              if (p && p.state === 'alive') {
                const cap = sim.teacher === 'watch' ? TEACHER_CAP : 1
                fire(p, sim.cpu.tx - p.x, sim.cpu.ty - p.y, Math.min(sim.cpu.power, cap))
              } else sim.cpu = null
            }
          }
        }
      } else if (sim.phase === 'sim') {
        const n = Math.ceil(dt / 0.008)
        const h = dt / n
        for (let i = 0; i < n; i++) {
          sim.gimmickT += h
          stepSim(sim.pieces, h, sim.charges, events, st, sim.shrink, sim.gimmickT)
        }
        processEvents(events)
        sim.simTime += dt
        if (sim.simTime > 8) {
          for (const p of sim.pieces) { p.vx = 0; p.vy = 0 }
        }
        if (sim.simTime > 0.15 && allSettled(sim.pieces)) {
          // 先に机をちぢめて、ゾーン内の駒が落ちてから決着判定
          if (!maybeShrink()) resolve()
        }
      } else if (sim.phase === 'roundEnd') {
        sim.timer -= dt
        if (sim.timer <= 0) startRound()
      } else if (sim.phase === 'matchEnd') {
        sim.timer -= dt
        if (sim.timer <= 0 && !sim.finished) {
          sim.finished = true
          const wi = sim.scores.findIndex((s) => s >= 2)
          onFinishRef.current((wi >= 0 ? wi : 0) as PlayerId, [...sim.scores])
        }
      }
    }

    /* ---- 描画 ---- */
    const draw = () => {
      const s = canvas.width / wld.w
      const sx = sim.shake > 0.2 ? (Math.random() - 0.5) * 2 * sim.shake : 0
      const sy = sim.shake > 0.2 ? (Math.random() - 0.5) * 2 * sim.shake : 0
      ctx.setTransform(s, 0, 0, s, sx * s, sy * s)
      drawTable(ctx, st, sim.shrink, sim.gimmickT, wld.w, wld.h)

      const dragPiece = sim.drag ? sim.pieces.find((q) => q.id === sim.drag!.pieceId) : null
      if (sim.teacher === 'watch') {
        const lookP = dragPiece ?? sim.pieces.find((q) => q.player === sim.turn && q.state === 'alive')
        drawTeacher(
          ctx,
          sim.teacherT,
          lookP?.x ?? wld.w / 2,
          lookP?.y ?? wld.h / 2,
          st.round ? st.round.y - st.round.r : DESK.y,
          wld.w,
        )
      }
      const aimCap = sim.teacher === 'watch' ? TEACHER_CAP : 1
      for (const p of sim.pieces) {
        if (p.state === 'dead') continue
        const active =
          sim.phase === 'aim' && p.player === sim.turn && !isCpuTurn() && p.state === 'alive'
        ctx.globalAlpha = dragPiece && dragPiece.id !== p.id ? 0.75 : 1
        drawEraser(ctx, p, sim.time, active, dragPiece?.id === p.id)
        ctx.globalAlpha = 1
      }

      if (dragPiece && sim.drag) {
        drawAim(ctx, dragPiece, sim.drag.px, sim.drag.py, PLAYER_COLORS[sim.turn], aimCap)
      }
      if (sim.cpu && sim.phase === 'aim') {
        const p = sim.pieces.find((q) => q.id === sim.cpu!.pieceId)
        if (p) {
          const prog = Math.min(sim.cpu.t / sim.cpu.dur, 1)
          const fakeLen = (55 + sim.cpu.power * 225) * prog
          const dx = sim.cpu.tx - p.x
          const dy = sim.cpu.ty - p.y
          const l = Math.hypot(dx, dy) || 1
          drawAim(
            ctx, p,
            p.x - (dx / l) * Math.min(fakeLen, MAX_DRAG * sim.cpu.power),
            p.y - (dy / l) * Math.min(fakeLen, MAX_DRAG * sim.cpu.power),
            PLAYER_COLORS[1],
            aimCap,
          )
        }
      }

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

      if (sim.flash > 0) {
        ctx.fillStyle = `rgba(249,115,22,${sim.flash * 0.45})`
        ctx.fillRect(-20, -20, wld.w + 40, wld.h + 40)
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
  const world = stage.world ?? WORLD
  // キャンバス: 横幅は「画面の高さに収まる幅」と「100%」の小さい方
  const columnWidth = `min(100%, calc((100dvh - 245px) * ${(world.w / world.h).toFixed(4)}))`

  return (
    <div className="bg-notebook flex min-h-dvh flex-col items-center px-3 py-3 sm:px-6">
      <div className="flex w-full flex-col" style={{ maxWidth: columnWidth, minWidth: 'min(100%, 340px)' }}>
        {/* スコアヘッダー */}
        <header className="flex w-full flex-col gap-1.5">
          <div className="flex items-center justify-center gap-3">
            <p className="font-display text-base leading-none sm:text-lg">
              <span aria-hidden="true">{stage.emoji}</span> ラウンド{' '}
              <span className="font-num text-xl">{hud.round}</span>
            </p>
            <p
              className="font-num text-lg font-bold leading-none tracking-widest"
              aria-label={`スコア ${hud.scores.join(' 対 ')}`}
            >
              {hud.scores.map((s, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1 text-ink-soft">|</span>}
                  <span style={{ color: PLAYER_COLORS[i] }}>{'★'.repeat(s) || '☆'}</span>
                </span>
              ))}
            </p>
          </div>
          <div className="flex w-full items-start justify-between gap-2">
            {hud.alive.map((a, i) => (
              <div key={i} className="relative">
                <PlayerChip
                  mode={mode}
                  player={i as PlayerId}
                  alive={a}
                  active={hud.turn === i && hud.phase === 'aim'}
                  sub={mode === '1p' && i === 1 ? CPU_LEVEL_LABEL[cpuLevel] : undefined}
                />
                <EmoteBubble
                  msg={emotes[i as PlayerId]}
                  side={i === 0 ? 'left' : i === hud.alive.length - 1 ? 'right' : 'center'}
                />
              </div>
            ))}
          </div>
        </header>

        {/* バトルキャンバス */}
        <div className="relative mt-2 w-full">
          <div className="sketch overflow-hidden bg-paper shadow-sketch">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`ステージ「${stage.name}」のバトルの机。自分の消しゴムをドラッグして引っぱり、はなすと発射します。`}
              className="w-full"
              style={{ aspectRatio: `${world.w} / ${world.h}` }}
            />
          </div>

          {/* ターンバナー */}
          <div className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${hud.turn}-${hud.phase === 'aim'}-${cpuThinking}-${hud.shrinking}-${hud.teacher}`}
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                className="sketch-alt whitespace-nowrap px-4 py-1.5 font-display text-sm text-white shadow-sketch-sm sm:text-base"
                style={{
                  background:
                    hud.teacher === 'watch' && hud.phase === 'aim'
                      ? '#92400e'
                      : hud.shrinking
                        ? '#dc2626'
                        : turnColor,
                }}
              >
                {hud.shrinking && '⚠️ '}
                {hud.phase === 'aim' && hud.teacher === 'watch' && '👓50%まで! '}
                {hud.phase === 'aim' && hud.teacher === 'warn' && '💦 '}
                {hud.phase === 'aim' && hud.alive[hud.turn] === 1 && '🔥'}
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
        <div className="mt-2 flex w-full items-center justify-between gap-2">
          <SketchButton variant="ghost" onClick={onExit} className="!min-h-11 !px-3 text-sm">
            ← タイトル
          </SketchButton>
          <p className="min-w-0 flex-1 text-right text-[11px] font-bold leading-snug text-ink-soft sm:text-xs">
            ✌️ ひっぱって はなすと発射!
            <br className="sm:hidden" />
            ふちから おとされたら まけ
          </p>
          <EmotePicker onPick={(e) => sendEmote(mode === '1p' ? 0 : hud.turn, e)} />
          <MuteButton />
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
  sub,
}: {
  mode: Mode
  player: PlayerId
  alive: number
  active: boolean
  sub?: string
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
        {sub && <span className="ml-1 text-[10px] text-ink-soft">({sub})</span>}
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

/* ---------------- エモート吹き出し ---------------- */
function EmoteBubble({ msg, side }: { msg: EmoteMsg | null; side: 'left' | 'right' | 'center' }) {
  return (
    <div
      className={cx(
        'pointer-events-none absolute top-full z-20 mt-2.5',
        side === 'left' ? 'left-1' : side === 'right' ? 'right-1' : 'left-1/2 -translate-x-1/2',
      )}
    >
      <AnimatePresence>
        {msg && (
          <motion.div
            key={msg.id}
            role="status"
            initial={{ scale: 0.3, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="sketch-alt relative whitespace-nowrap bg-white px-3 py-1.5 shadow-sketch-sm"
          >
            <span
              aria-hidden="true"
              className={cx(
                'absolute -top-[7px] h-3 w-3 rotate-45 border-l-[2.5px] border-t-[2.5px] border-ink bg-white',
                side === 'left' ? 'left-5' : side === 'right' ? 'right-5' : 'left-1/2 -translate-x-1/2',
              )}
            />
            <span className="text-base" aria-hidden="true">
              {msg.emoji}
            </span>{' '}
            <span className="font-display text-sm">{msg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------- エモートピッカー ---------------- */
function EmotePicker({ onPick }: { onPick: (e: Emote) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <motion.button
        type="button"
        aria-label="エモートをおくる"
        aria-expanded={open}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          sfx.click()
          setOpen((o) => !o)
        }}
        className="sketch flex h-11 w-11 items-center justify-center bg-white text-xl shadow-sketch-sm transition-colors hover:bg-paper-deep"
      >
        <span aria-hidden="true">💬</span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="sketch absolute bottom-[52px] right-0 z-30 flex gap-1 bg-white p-1.5 shadow-sketch"
          >
            {EMOTES.map((e) => (
              <button
                key={e.emoji}
                type="button"
                aria-label={`エモート: ${e.text}`}
                onClick={() => {
                  onPick(e)
                  setOpen(false)
                }}
                className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg px-1 transition-colors hover:bg-paper-deep"
              >
                <span className="text-lg" aria-hidden="true">
                  {e.emoji}
                </span>
                <span className="text-[9px] font-bold leading-none">{e.text}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
