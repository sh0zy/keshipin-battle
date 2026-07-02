// Canvas 自前物理: 円ベースの押し合い / 摩擦 / 机のふち判定 / 壁・穴 / 特殊ギア効果
import type { Build, PlayerId } from './data'
import type { Stage, Wall } from './stages'

// 縦長ステージ (スマホ最適)
export const WORLD = { w: 600, h: 880 }
export const DESK = { x: 60, y: 70, w: 480, h: 740 }
export const MAX_DRAG = 190
const MAX_SPEED = 980
const RESTITUTION = 0.82
const WALL_RESTITUTION = 0.75
const STOP_SPEED = 9
const FALL_DURATION = 0.55

export type PieceState = 'alive' | 'falling' | 'dead'

export interface Piece {
  id: number
  player: PlayerId
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  spin: number
  radius: number
  mass: number
  lin: number // 線形減速
  k: number // 速度比例減速
  kbDealt: number
  kbTaken: number
  maxPowerMul: number
  critChance: number
  magnet: boolean
  straight: boolean
  sticky: boolean
  hasTape: boolean
  hasProt: boolean
  state: PieceState
  fallT: number
  launched: number // 発射からの経過秒 (-1 = 停止中)
  emojis: string[]
}

export type SimEvent =
  | { type: 'hit'; x: number; y: number; strength: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'fall'; x: number; y: number; player: PlayerId }
  | { type: 'tape'; x: number; y: number; player: PlayerId }
  | { type: 'bounce'; x: number; y: number }

export interface Charges {
  tapeUsed: [boolean, boolean] // 1試合1回
  protUsed: [boolean, boolean] // 1ラウンド1回
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function createRoundPieces(builds: [Build, Build]): Piece[] {
  const pieces: Piece[] = []
  const cx = DESK.x + DESK.w / 2
  const offsets = [-140, 0, 140]
  let id = 0
  for (const player of [0, 1] as PlayerId[]) {
    const b = builds[player]
    const y = player === 0 ? DESK.y + DESK.h - 66 : DESK.y + 66
    for (let s = 0; s < 3; s++) {
      pieces.push({
        id: id++,
        player,
        x: cx + offsets[s],
        y,
        vx: 0,
        vy: 0,
        angle: (player === 0 ? -0.06 : 0.06) * (s - 1),
        spin: 0,
        radius: 15 + b.size * 2.6,
        mass: 0.7 + b.weight * 0.28,
        lin: clamp(95 - b.slip * 8, 30, 200),
        k: clamp(1.35 - b.slip * 0.12, 0.32, 2),
        kbDealt: b.kbDealt,
        kbTaken: b.kbTaken,
        maxPowerMul: b.maxPower,
        critChance: b.critChance,
        magnet: b.magnet,
        straight: b.straight,
        sticky: b.sticky,
        hasTape: b.tape,
        hasProt: b.protractor,
        state: 'alive',
        fallT: 0,
        launched: -1,
        emojis: b.gearIds.map((gid) => gid), // 描画側で emoji 解決
      })
    }
  }
  return pieces
}

export function launchPiece(p: Piece, dx: number, dy: number, power01: number): boolean {
  const len = Math.hypot(dx, dy) || 1
  const crit = Math.random() < p.critChance
  const speed = (240 + 760 * clamp(power01, 0, 1)) * p.maxPowerMul * (crit ? 1.85 : 1)
  p.vx = (dx / len) * Math.min(speed, MAX_SPEED * p.maxPowerMul * (crit ? 1.85 : 1))
  p.vy = (dy / len) * Math.min(speed, MAX_SPEED * p.maxPowerMul * (crit ? 1.85 : 1))
  p.spin = (Math.random() - 0.5) * 6
  p.launched = 0
  return crit
}

function applyFriction(p: Piece, dt: number) {
  const sp = Math.hypot(p.vx, p.vy)
  if (sp <= 0) return
  const dec = (p.lin + p.k * sp) * dt
  const ns = Math.max(0, sp - dec)
  if (ns < STOP_SPEED * 0.6) {
    p.vx = 0
    p.vy = 0
  } else {
    p.vx *= ns / sp
    p.vy *= ns / sp
  }
}

function steerMagnet(p: Piece, pieces: Piece[], dt: number) {
  if (!p.magnet || p.launched < 0 || p.launched > 0.75) return
  const sp = Math.hypot(p.vx, p.vy)
  if (sp < 60) return
  let best: Piece | null = null
  let bd = Infinity
  for (const q of pieces) {
    if (q.player === p.player || q.state !== 'alive') continue
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d < bd) {
      bd = d
      best = q
    }
  }
  if (!best) return
  const cur = Math.atan2(p.vy, p.vx)
  const want = Math.atan2(best.y - p.y, best.x - p.x)
  let diff = want - cur
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  const turn = clamp(diff, -1.9 * dt, 1.9 * dt)
  const na = cur + turn
  p.vx = Math.cos(na) * sp
  p.vy = Math.sin(na) * sp
}

function collide(a: Piece, b: Piece, events: SimEvent[]) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  const minDist = a.radius + b.radius
  if (dist >= minDist || dist === 0) return
  const nx = dx / dist
  const ny = dy / dist
  // 位置補正
  const overlap = minDist - dist
  const invA = 1 / a.mass
  const invB = 1 / b.mass
  const total = invA + invB
  a.x -= nx * overlap * (invA / total)
  a.y -= ny * overlap * (invA / total)
  b.x += nx * overlap * (invB / total)
  b.y += ny * overlap * (invB / total)
  // 撃力
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (rv > 0) return
  const j = (-(1 + RESTITUTION) * rv) / total
  // ノックバック補正: 相手の kbDealt × 自分の kbTaken
  const jA = j * b.kbDealt * a.kbTaken
  const jB = j * a.kbDealt * b.kbTaken
  a.vx -= jA * invA * nx
  a.vy -= jA * invA * ny
  b.vx += jB * invB * nx
  b.vy += jB * invB * ny
  a.spin += (Math.random() - 0.5) * 4
  b.spin += (Math.random() - 0.5) * 4
  if (j > 20) {
    events.push({
      type: 'hit',
      x: a.x + nx * a.radius,
      y: a.y + ny * a.radius,
      strength: j,
    })
  }
}

// 壁(えんぴつ / ふでばこ)との衝突: はね返る
function collideWall(p: Piece, w: Wall, events: SimEvent[]) {
  const cx = clamp(p.x, w.x, w.x + w.w)
  const cy = clamp(p.y, w.y, w.y + w.h)
  const dx = p.x - cx
  const dy = p.y - cy
  const d = Math.hypot(dx, dy)
  if (d >= p.radius) return
  let nx: number
  let ny: number
  if (d > 0.0001) {
    nx = dx / d
    ny = dy / d
    p.x = cx + nx * p.radius
    p.y = cy + ny * p.radius
  } else {
    // 中心がめり込んだ場合は最小侵入軸で押し出す
    const pl = p.x - w.x
    const pr = w.x + w.w - p.x
    const pt = p.y - w.y
    const pb = w.y + w.h - p.y
    const m = Math.min(pl, pr, pt, pb)
    nx = 0
    ny = 0
    if (m === pl) {
      nx = -1
      p.x = w.x - p.radius
    } else if (m === pr) {
      nx = 1
      p.x = w.x + w.w + p.radius
    } else if (m === pt) {
      ny = -1
      p.y = w.y - p.radius
    } else {
      ny = 1
      p.y = w.y + w.h + p.radius
    }
  }
  const vn = p.vx * nx + p.vy * ny
  if (vn < 0) {
    p.vx -= (1 + WALL_RESTITUTION) * vn * nx
    p.vy -= (1 + WALL_RESTITUTION) * vn * ny
    p.spin += (Math.random() - 0.5) * 3
    if (-vn > 140) {
      events.push({ type: 'wall', x: p.x - nx * p.radius, y: p.y - ny * p.radius })
    }
  }
}

// インクの穴: ふんだら落ちる (テープでセーフ可)
function holeCheck(p: Piece, stage: Stage, charges: Charges, events: SimEvent[]) {
  for (const h of stage.holes) {
    const d = Math.hypot(p.x - h.x, p.y - h.y)
    if (d >= h.r * 0.85) continue
    if (p.hasTape && !charges.tapeUsed[p.player]) {
      charges.tapeUsed[p.player] = true
      const ux = d > 1 ? (p.x - h.x) / d : 1
      const uy = d > 1 ? (p.y - h.y) / d : 0
      p.x = h.x + ux * (h.r + p.radius * 0.4)
      p.y = h.y + uy * (h.r + p.radius * 0.4)
      p.vx = 0
      p.vy = 0
      events.push({ type: 'tape', x: p.x, y: p.y, player: p.player })
    } else {
      p.state = 'falling'
      p.fallT = 0
      // 穴の中心へ吸い込まれる
      p.vx = (h.x - p.x) * 2.2
      p.vy = (h.y - p.y) * 2.2
      events.push({ type: 'fall', x: p.x, y: p.y, player: p.player })
    }
    return
  }
}

function edgeCheck(p: Piece, charges: Charges, events: SimEvent[]) {
  const overL = DESK.x - p.x
  const overR = p.x - (DESK.x + DESK.w)
  const overT = DESK.y - p.y
  const overB = p.y - (DESK.y + DESK.h)
  const over = Math.max(overL, overR, overT, overB)
  if (over <= -p.radius * 0.05) return

  const speed = Math.hypot(p.vx, p.vy)
  // 分度器: ふちで跳ね返る (1ラウンド1回)
  if (p.hasProt && !charges.protUsed[p.player] && speed > 40) {
    charges.protUsed[p.player] = true
    if (over === overL || over === overR) {
      p.vx = -p.vx * 0.72
      p.x = over === overL ? DESK.x + 2 : DESK.x + DESK.w - 2
    } else {
      p.vy = -p.vy * 0.72
      p.y = over === overT ? DESK.y + 2 : DESK.y + DESK.h - 2
    }
    events.push({ type: 'bounce', x: p.x, y: p.y })
    return
  }

  const fallAt = p.radius * (p.sticky ? 0.6 : 0.32)
  // セロハンテープ: 落ちる寸前にセーフ (1試合1回)
  if (over > p.radius * 0.18 && p.hasTape && !charges.tapeUsed[p.player]) {
    charges.tapeUsed[p.player] = true
    const inset = p.radius * 0.55
    p.x = clamp(p.x, DESK.x + inset - p.radius, DESK.x + DESK.w - inset + p.radius)
    p.y = clamp(p.y, DESK.y + inset - p.radius, DESK.y + DESK.h - inset + p.radius)
    p.vx = 0
    p.vy = 0
    events.push({ type: 'tape', x: p.x, y: p.y, player: p.player })
    return
  }

  if (over > fallAt) {
    p.state = 'falling'
    p.fallT = 0
    events.push({ type: 'fall', x: p.x, y: p.y, player: p.player })
  }
}

export function stepSim(
  pieces: Piece[],
  dt: number,
  charges: Charges,
  events: SimEvent[],
  stage: Stage,
) {
  for (const p of pieces) {
    if (p.state === 'falling') {
      p.fallT += dt
      p.x += p.vx * 0.35 * dt
      p.y += p.vy * 0.35 * dt
      p.angle += 5 * dt
      if (p.fallT >= FALL_DURATION) p.state = 'dead'
      continue
    }
    if (p.state !== 'alive') continue
    if (p.launched >= 0) p.launched += dt
    steerMagnet(p, pieces, dt)
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.angle += p.spin * dt
    p.spin *= Math.exp(-2.2 * dt)
    applyFriction(p, dt)
  }
  const alive = pieces.filter((p) => p.state === 'alive')
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      collide(alive[i], alive[j], events)
    }
  }
  for (const p of alive) {
    for (const w of stage.walls) collideWall(p, w, events)
    if (p.state === 'alive') holeCheck(p, stage, charges, events)
    if (p.state === 'alive') edgeCheck(p, charges, events)
  }
}

export function allSettled(pieces: Piece[]): boolean {
  return pieces.every(
    (p) =>
      p.state === 'dead' ||
      (p.state === 'alive' && Math.hypot(p.vx, p.vy) < STOP_SPEED),
  )
}

export function aliveCount(pieces: Piece[], player: PlayerId): number {
  return pieces.filter((p) => p.player === player && p.state !== 'dead').length
}
