// ステージ定義: 壁(はね返る) / インクの穴(おちる) / ふちの開閉
import { DESK } from './physics'

export interface Wall {
  x: number
  y: number
  w: number
  h: number
  kind: 'pencil' | 'case'
}

export interface Hole {
  x: number
  y: number
  r: number
}

export interface OpenEdges {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

export interface Stage {
  id: string
  name: string
  emoji: string
  desc: string
  openEdges: OpenEdges
  walls: Wall[]
  holes: Hole[]
}

const cx = DESK.x + DESK.w / 2
const cy = DESK.y + DESK.h / 2
const allOpen: OpenEdges = { left: true, right: true, top: true, bottom: true }

export const STAGES: Stage[] = [
  {
    id: 'classic',
    name: 'いつもの机',
    emoji: '🪵',
    desc: 'なにもない ただの木の机。じつりょくで しょうぶ!',
    openEdges: allOpen,
    walls: [],
    holes: [],
  },
  {
    id: 'pencil-walls',
    name: 'えんぴつガード',
    emoji: '✏️',
    desc: 'よこには えんぴつの壁ではね返る。おとせるのは 上下のふちだけ!',
    openEdges: { left: false, right: false, top: true, bottom: true },
    walls: [
      { x: DESK.x + 2, y: DESK.y + 8, w: 24, h: DESK.h - 16, kind: 'pencil' },
      { x: DESK.x + DESK.w - 26, y: DESK.y + 8, w: 24, h: DESK.h - 16, kind: 'pencil' },
    ],
    holes: [],
  },
  {
    id: 'pencil-case',
    name: 'ふでばこ砦',
    emoji: '🎒',
    desc: 'まんなかに ふでばこがドン!かべにかくれて 身をまもれ。',
    openEdges: allOpen,
    walls: [{ x: cx - 95, y: cy - 42, w: 190, h: 84, kind: 'case' }],
    holes: [],
  },
  {
    id: 'ink-holes',
    name: 'インクのぬま',
    emoji: '🕳️',
    desc: 'こぼれたインクは おとしあな。ふんだら そこでアウト!',
    openEdges: allOpen,
    walls: [],
    holes: [
      { x: cx, y: cy, r: 46 },
      { x: DESK.x + 110, y: DESK.y + 200, r: 32 },
      { x: DESK.x + DESK.w - 110, y: DESK.y + DESK.h - 200, r: 32 },
    ],
  },
]
