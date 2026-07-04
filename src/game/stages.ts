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
  /** 丸テーブル (指定すると机が円形になる) */
  round?: { x: number; y: number; r: number }
  /** ステージ独自のワールドサイズ (省略時は 600x880) */
  world?: { w: number; h: number }
  /** 摩擦補正 (1より大きいと止まりやすい。初撃キル防止用) */
  drag?: number
  /** 3人せんよう配置 (プレイヤーごとの3駒スポット) */
  spawn3?: [number, number][][]
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

/* ================================================================
   3人せんようステージ: 大きな丸テーブル (120°の完全対称でだれも不利にならない)
   - スポーンは全員「中心から220px・120°間隔」で完全同条件
   - 半径380の大型テーブル: フルパワーの初撃でも たおしきれない距離設計
   ================================================================ */
const RC = { x: 435, y: 460 } // 丸テーブルの中心
const R_TABLE = 400
const RWORLD = { w: 870, h: 880 } // 丸テーブル用の広いワールド

// リング状スポーン: 半径 ring の円周上、120°間隔の3クラスタ (中央 ± spread度)
function ringSpawns(ring: number, spreadDeg: number): [number, number][][] {
  const seats = [90, 210, 330] // 下 / 左上 / 右上
  return seats.map((base) =>
    [-spreadDeg, 0, spreadDeg].map((off) => {
      const a = ((base + off) * Math.PI) / 180
      return [
        Math.round(RC.x + Math.cos(a) * ring),
        Math.round(RC.y + Math.sin(a) * ring),
      ] as [number, number]
    }),
  )
}

const RING_SPAWN = ringSpawns(230, 17)
const roundBase = {
  openEdges: allOpen,
  round: { ...RC, r: R_TABLE },
  world: RWORLD,
  spawn3: RING_SPAWN,
  drag: 1.25, // 大きな机は少し止まりやすく → 初撃で倒しきれない
}

export const STAGES_3P: Stage[] = [
  {
    id: 't-round',
    name: 'まるいつくえ',
    emoji: '🟤',
    desc: 'おおきな まんまるテーブルで 3人が完全にたいとう!じっくり真剣勝負。',
    walls: [],
    holes: [],
    ...roundBase,
  },
  {
    id: 't-cheese',
    name: 'チーズのテーブル',
    emoji: '🧀',
    desc: 'あちこちに あながあいた チーズみたいな机。うっかりふむな!',
    walls: [],
    holes: [
      { x: RC.x, y: RC.y, r: 50 },
      { x: 548, y: 525, r: 34 },
      { x: 322, y: 525, r: 34 },
      { x: 435, y: 330, r: 34 },
    ],
    ...roundBase,
  },
  {
    id: 't-holes',
    name: 'みつあなリング',
    emoji: '🕳️',
    desc: 'じんちのあいだに 3つのおとしあな。せめる道をえらべ!',
    walls: [],
    holes: [
      { x: 574, y: 540, r: 36 },
      { x: 296, y: 540, r: 36 },
      { x: 435, y: 300, r: 36 },
    ],
    ...roundBase,
  },
  {
    id: 't-donut',
    name: 'ドーナツテーブル',
    emoji: '🍩',
    desc: 'まんなかは 巨大なおとしあな。せまいふちの とりあいだ!',
    walls: [],
    holes: [{ x: RC.x, y: RC.y, r: 120 }],
    ...roundBase,
  },
  {
    id: 't-forts',
    name: 'まるい砦',
    emoji: '🏰',
    desc: 'それぞれの じんちのまえに ふでばこの盾。こもるか、せめるか。',
    walls: [
      { x: 355, y: 571, w: 160, h: 56, kind: 'case' },
      { x: 284, y: 330, w: 56, h: 130, kind: 'case' },
      { x: 530, y: 330, w: 56, h: 130, kind: 'case' },
    ],
    holes: [],
    ...roundBase,
  },
  {
    id: 't-compass',
    name: 'まわる見はり',
    emoji: '🌀',
    desc: 'まんなかで コンパスがかいてん。だれにでも びょうどうに きびしい!',
    walls: [],
    holes: [],
    spinner: { x: RC.x, y: RC.y, length: 150, radius: 11, speed: 1.3 },
    ...roundBase,
  },
  {
    id: 't-whirl',
    name: 'うずまきテーブル',
    emoji: '🌊',
    desc: 'ながれが うずをまき、まんなかには インクのあな。ながされるな!',
    walls: [],
    holes: [{ x: RC.x, y: RC.y, r: 45 }],
    tilt: { accel: 65, period: 14 },
    ...roundBase,
  },
]
