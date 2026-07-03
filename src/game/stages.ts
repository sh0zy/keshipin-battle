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

// 回転コンパス (針がまわる動く障害物)
export interface Spinner {
  x: number
  y: number
  length: number // 針の半分の長さ
  radius: number // 針の太さ
  speed: number // rad/s
}

// かたむいた机 (動いている駒が流される)
export interface Tilt {
  accel: number // 流れの強さ (px/s^2)
  period: number // 流れの方向が一周する秒数
}

export interface Stage {
  id: string
  name: string
  emoji: string
  desc: string
  openEdges: OpenEdges
  walls: Wall[]
  holes: Hole[]
  spinner?: Spinner
  tilt?: Tilt
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
      { x: DESK.x + 110, y: DESK.y + 250, r: 32 },
      { x: DESK.x + DESK.w - 110, y: DESK.y + DESK.h - 250, r: 32 },
    ],
  },
  {
    id: 'donut',
    name: 'ドーナツのあな',
    emoji: '🍩',
    desc: 'まんなかは 大きなおとしあな。ぐるっとまわって せめろ!',
    openEdges: allOpen,
    walls: [],
    holes: [{ x: cx, y: cy, r: 90 }],
  },
  {
    id: 'ink-bridge',
    name: 'インクのはし',
    emoji: '🌉',
    desc: '左右は インクのうみ。まんなかの ほそい橋を とおるしかない!',
    openEdges: allOpen,
    walls: [],
    holes: [
      { x: DESK.x + 95, y: cy, r: 78 },
      { x: DESK.x + DESK.w - 95, y: cy, r: 78 },
    ],
  },
  {
    id: 'twin-forts',
    name: 'ふたごのとりで',
    emoji: '🏯',
    desc: '2つのふでばこが ななめにかまえる。かげから ふいうちだ!',
    openEdges: allOpen,
    walls: [
      { x: DESK.x + 30, y: cy - 170, w: 170, h: 70, kind: 'case' },
      { x: DESK.x + DESK.w - 200, y: cy + 100, w: 170, h: 70, kind: 'case' },
    ],
    holes: [],
  },
  {
    id: 'compass-guard',
    name: 'コンパスの見はり',
    emoji: '🌀',
    desc: 'まんなかで コンパスの針がぐるぐる。当たると はじきとばされる!',
    openEdges: allOpen,
    walls: [],
    holes: [],
    spinner: { x: cx, y: cy, length: 150, radius: 11, speed: 1.1 },
  },
  {
    id: 'tilted-desk',
    name: 'かたむいた机',
    emoji: '🎢',
    desc: 'つくえが かたむいてる!? うごいている駒は 流れにながされる。',
    openEdges: allOpen,
    walls: [],
    holes: [],
    tilt: { accel: 60, period: 18 },
  },
  {
    id: 'messy-desk',
    name: 'ちらかった机',
    emoji: '🌪️',
    desc: 'かべ・あな・ふでばこ ぜんぶのせ。かたづいてないほうが おもしろい!',
    openEdges: { left: false, right: true, top: true, bottom: true },
    walls: [
      { x: DESK.x + 2, y: DESK.y + 8, w: 24, h: DESK.h - 16, kind: 'pencil' },
      { x: cx + 10, y: cy + 40, w: 150, h: 64, kind: 'case' },
    ],
    holes: [{ x: cx - 90, y: cy - 120, r: 34 }],
  },
]
