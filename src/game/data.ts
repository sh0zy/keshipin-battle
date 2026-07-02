// ゲームの静的データ: プレイヤー / 20種の文房具ギア / ビルド計算

export type PlayerId = 0 | 1
export type Mode = '1p' | '2p'

export const BASE_STAT = 3
export const STAT_MAX = 8

export const PLAYER_COLORS: [string, string] = ['#2563eb', '#e11d48']
export const PLAYER_SOFT: [string, string] = ['#dbeafe', '#ffe4e6']

export function playerLabel(mode: Mode, id: PlayerId): string {
  if (mode === '1p') return id === 0 ? 'あなた' : 'CPU'
  return id === 0 ? 'プレイヤー1' : 'プレイヤー2'
}

export type Special = 'crit' | 'tape' | 'protractor' | 'magnet' | 'straight' | 'sticky'

export interface Gear {
  id: string
  name: string
  emoji: string
  short: string // カード内の一言効果
  detail: string // 詳細説明
  weight?: number
  slip?: number
  size?: number
  kbDealt?: number // 与ノックバック補正 (+0.3 = +30%)
  kbTaken?: number // 被ノックバック補正 (-0.2 = -20%)
  maxPower?: number // 最大パワー補正
  special?: Special
}

export const GEARS: Gear[] = [
  { id: 'cover', name: '消しゴムカバー', emoji: '🛡️', short: '重さ+2 / うけるふっとび-20%', detail: '紙のカバーでガッチリガード。重くなって、はじかれても ふっとびにくい!', weight: 2, kbTaken: -0.2 },
  { id: 'scissors', name: 'ハサミ', emoji: '✂️', short: 'あたえるふっとび+30%', detail: 'よく切れるぶん、当てたときの ふっとばし力が大アップ!', kbDealt: 0.3 },
  { id: 'compass', name: 'コンパスの針', emoji: '📍', short: '20%で2倍クリティカル', detail: 'はじくとき、20%のかくりつで 2倍パワーのクリティカル!いちかばちか!', special: 'crit' },
  { id: 'ruler30', name: '30cm定規', emoji: '📏', short: 'サイズ+2', detail: 'デッカくなって当てやすい!でも自分も ねらわれやすいぞ。', size: 2 },
  { id: 'triangle', name: '三角定規', emoji: '📐', short: 'すべり+1 / ふっとび+10%', detail: 'とがったカドで、するどく はじきとばす。バランス型。', slip: 1, kbDealt: 0.1 },
  { id: 'sheet', name: '下敷き', emoji: '🛝', short: 'すべり+2', detail: 'ツルツルの下敷きパワーで、スーッとよく飛ぶ!', slip: 2 },
  { id: 'glue', name: 'スティックのり', emoji: '🧴', short: 'すべり-2 / おちにくい', detail: 'ベタベタですぐ止まる。机のふちでも ねばって落ちにくい!', slip: -2, special: 'sticky' },
  { id: 'fusen', name: '付箋ブロック', emoji: '🗒️', short: 'すべり-3 / 重さ-1', detail: 'ピタッ!と止まる ふせんのちから。動かない作戦に。', slip: -3, weight: -1 },
  { id: 'tape', name: 'セロハンテープ', emoji: '🎞️', short: '1試合1回 おちる寸前セーフ', detail: '机から落ちそうになったら、テープでふちに ふみとどまる。1試合に1回だけ!', special: 'tape' },
  { id: 'stapler', name: 'ホッチキス', emoji: '🗜️', short: '重さ+3 / すべり-1', detail: '金属のかたまり。おしあいに超つよいが、ちょっと動きにくい。', weight: 3, slip: -1 },
  { id: 'clip', name: 'ダブルクリップ', emoji: '🖇️', short: '重さ+1 / サイズ-1', detail: '小さくギュッと高密度。当てられにくくて重い、いぶし銀。', weight: 1, size: -1 },
  { id: 'pencap', name: '鉛筆キャップ', emoji: '🧢', short: 'すべり+3 / 重さ-1', detail: 'ロケットみたいに ぶっ飛ぶスピード型。軽いので押し合いは苦手。', slip: 3, weight: -1 },
  { id: 'correction', name: '修正テープ', emoji: '🩹', short: 'まっすぐ安定 / うけるふっとび-10%', detail: 'スーッとまっすぐ進む安定感。はじかれても少し耐える。', kbTaken: -0.1, special: 'straight' },
  { id: 'protractor', name: '分度器', emoji: '🌗', short: '1ラウンド1回 ふちでバウンド', detail: '机のふちから落ちる…と見せかけて、はんえんの力で跳ね返る!1ラウンド1回。', special: 'protractor' },
  { id: 'rubber', name: '輪ゴム', emoji: '➰', short: 'はじく最大パワー+20%', detail: 'ビヨーンとのばして、限界をこえた一撃を!', maxPower: 0.2 },
  { id: 'magnet', name: '磁石', emoji: '🧲', short: '敵にむかって軌道が曲がる', detail: '発射したあと、いちばん近い敵へ グイッと吸いよせられる。', special: 'magnet' },
  { id: 'marker', name: '蛍光ペン', emoji: '🖍️', short: 'すべり+1 / サイズ+1', detail: 'あかるく目立つ攻めのカスタム。すこし大きく、よく滑る。', slip: 1, size: 1 },
  { id: 'lead', name: 'シャー芯ケース', emoji: '✏️', short: '重さ+1 / すべり+1', detail: 'シャー芯をつめて ちょうどいい重さに。クセのない強化。', weight: 1, slip: 1 },
  { id: 'ring', name: '単語カードリング', emoji: '🔗', short: 'サイズ-2', detail: 'ちいさくなって、敵の攻撃をスルリとかわす回避型。', size: -2 },
  { id: 'sticker', name: 'きらきらシール', emoji: '✨', short: '重さ+1 / すべり+1', detail: 'キラキラの力で全体的にパワーアップする万能シール。', weight: 1, slip: 1 },
]

export const gearById = (id: string): Gear => GEARS.find((g) => g.id === id)!

export interface Build {
  weight: number
  slip: number
  size: number
  kbDealt: number // 乗数 (1.0 = 補正なし)
  kbTaken: number
  maxPower: number
  critChance: number
  magnet: boolean
  straight: boolean
  sticky: boolean
  tape: boolean
  protractor: boolean
  gearIds: string[]
}

const clampStat = (v: number) => Math.min(STAT_MAX, Math.max(1, v))

export function computeBuild(gearIds: string[]): Build {
  let weight = BASE_STAT
  let slip = BASE_STAT
  let size = BASE_STAT
  let kbDealt = 1
  let kbTaken = 1
  let maxPower = 1
  let critChance = 0
  const b: Build = {
    weight, slip, size, kbDealt, kbTaken, maxPower, critChance,
    magnet: false, straight: false, sticky: false, tape: false, protractor: false,
    gearIds: [...gearIds],
  }
  for (const id of gearIds) {
    const g = gearById(id)
    weight += g.weight ?? 0
    slip += g.slip ?? 0
    size += g.size ?? 0
    kbDealt += g.kbDealt ?? 0
    kbTaken += g.kbTaken ?? 0
    maxPower += g.maxPower ?? 0
    if (g.special === 'crit') critChance = 0.2
    if (g.special === 'magnet') b.magnet = true
    if (g.special === 'straight') b.straight = true
    if (g.special === 'sticky') b.sticky = true
    if (g.special === 'tape') b.tape = true
    if (g.special === 'protractor') b.protractor = true
  }
  b.weight = clampStat(weight)
  b.slip = clampStat(slip)
  b.size = clampStat(size)
  b.kbDealt = kbDealt
  b.kbTaken = kbTaken
  b.maxPower = maxPower
  b.critChance = critChance
  return b
}

// ビルドの特殊効果を表示用チップに変換
export function buildChips(b: Build): string[] {
  const chips: string[] = []
  if (b.kbDealt > 1) chips.push(`ふっとばし +${Math.round((b.kbDealt - 1) * 100)}%`)
  if (b.kbTaken < 1) chips.push(`ふっとび ${Math.round((1 - b.kbTaken) * 100)}%カット`)
  if (b.maxPower > 1) chips.push(`最大パワー +${Math.round((b.maxPower - 1) * 100)}%`)
  if (b.critChance > 0) chips.push('クリティカル 20%')
  if (b.magnet) chips.push('じしゃくホーミング')
  if (b.straight) chips.push('まっすぐ安定')
  if (b.sticky) chips.push('ふちで ねばる')
  if (b.tape) chips.push('テープセーフ ×1/試合')
  if (b.protractor) chips.push('ふちバウンド ×1/R')
  return chips
}
