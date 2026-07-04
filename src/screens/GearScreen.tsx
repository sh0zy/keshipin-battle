// ギア装備画面: 20ギアのカードグリッド + 消しゴムプレビュー + ステータスアニメーション
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  GEARS,
  PLAYER_COLORS,
  buildChips,
  computeBuild,
  gearById,
  playerCount,
  playerLabel,
  type CpuLevel,
  type Gear,
  type Mode,
  type PlayerId,
} from '../game/data'
import { sfx } from '../game/sound'
import { EraserSVG, SketchButton, StatRow, Tape, cx } from '../components/ui'

// つよいCPUはシナジーのある組み合わせから選ぶ
const HARD_CPU_PAIRS: string[][] = [
  ['scissors', 'stapler'],
  ['magnet', 'scissors'],
  ['compass', 'rubber'],
  ['cover', 'stapler'],
  ['magnet', 'rubber'],
]

function pickCpuGears(level: CpuLevel): string[] {
  if (level === 'easy') {
    return [GEARS[Math.floor(Math.random() * GEARS.length)].id]
  }
  if (level === 'hard') {
    return [...HARD_CPU_PAIRS[Math.floor(Math.random() * HARD_CPU_PAIRS.length)]]
  }
  return [...GEARS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 2)
    .map((g) => g.id)
}

type Overlay =
  | { kind: 'swap'; next: PlayerId } // つぎのプレイヤーへ交代
  | { kind: 'cpu'; gears: string[] } // CPUの装備発表
  | null

export default function GearScreen({
  mode,
  cpuLevel = 'normal',
  initial,
  onDone,
  onBack,
}: {
  mode: Mode
  cpuLevel?: CpuLevel
  initial: string[][]
  onDone: (loadouts: string[][]) => void
  onBack: () => void
}) {
  const count = playerCount(mode)
  const [player, setPlayer] = useState<PlayerId>(0)
  const [sel, setSel] = useState<string[]>(initial[0] ?? [])
  const [detail, setDetail] = useState<Gear | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const saved = useRef<string[][]>([])
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const build = computeBuild(sel)
  const chips = buildChips(build)
  const color = PLAYER_COLORS[player]
  const name = playerLabel(mode, player)

  const toggle = (id: string) => {
    if (sel.includes(id)) sfx.unequip()
    else sfx.equip()
    setSel((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < 2
          ? [...cur, id]
          : [...cur.slice(1), id], // 満杯なら古い方と交換
    )
  }

  const confirm = () => {
    if (overlay) return
    if (mode === '1p') {
      // CPUの装備は強さで変わる
      const pool = pickCpuGears(cpuLevel)
      setOverlay({ kind: 'cpu', gears: pool })
      later(() => onDone([sel, pool]), 1600)
    } else if (player < count - 1) {
      saved.current[player] = sel
      const next = (player + 1) as PlayerId
      setOverlay({ kind: 'swap', next })
      later(() => {
        setPlayer(next)
        setSel(initial[next] ?? [])
        setDetail(null)
        setOverlay(null)
      }, 1100)
    } else {
      onDone([...saved.current.slice(0, count - 1), sel])
    }
  }

  return (
    <div className="bg-notebook min-h-dvh px-4 pb-8 pt-5 sm:px-6">
      {/* ヘッダー */}
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <SketchButton variant="ghost" onClick={onBack} className="!min-h-11 !px-4 text-base">
          ← もどる
        </SketchButton>
        <h1 className="font-display text-2xl sm:text-3xl">
          <span className="marker-swipe">そうびをえらぼう</span>
        </h1>
        <motion.span
          key={player}
          initial={{ scale: 0.6, rotate: -6 }}
          animate={{ scale: 1, rotate: -2 }}
          className="sketch-alt px-4 py-1.5 font-display text-lg text-white shadow-sketch-sm"
          style={{ background: color }}
        >
          {name}のばん
        </motion.span>
      </header>

      <div className="mx-auto mt-5 flex max-w-6xl flex-col gap-5 lg:flex-row">
        {/* プレビューパネル */}
        <aside className="lg:w-80 lg:shrink-0">
          <div className="sketch relative bg-white p-4 shadow-sketch lg:sticky lg:top-4">
            <Tape className="-top-3 left-1/2 -translate-x-1/2 -rotate-2 !w-20" tone={(['blue', 'pink', 'yellow'] as const)[player]} />
            <motion.div
              key={sel.join(',')}
              animate={{ rotate: [0, -2.5, 2, 0] }}
              transition={{ duration: 0.45 }}
              className="mx-auto w-44"
            >
              <EraserSVG
                color={color}
                emojis={sel.map((id) => gearById(id).emoji)}
                label={`${name}の消しゴムプレビュー`}
              />
            </motion.div>

            {/* 装備スロット */}
            <div className="mt-1 grid grid-cols-2 gap-2" aria-label="装備スロット">
              {[0, 1].map((i) => {
                const g = sel[i] ? gearById(sel[i]) : null
                return (
                  <div key={i} className="relative">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {g ? (
                        <motion.button
                          key={g.id}
                          type="button"
                          onClick={() => toggle(g.id)}
                          aria-label={`${g.name} をはずす`}
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          className="sketch group flex min-h-14 w-full items-center gap-2 bg-paper-deep px-2.5 py-1.5 text-left hover:bg-[#fecaca]"
                        >
                          <span className="text-2xl" aria-hidden="true">{g.emoji}</span>
                          <span className="min-w-0 flex-1 truncate font-display text-xs leading-tight">
                            {g.name}
                          </span>
                          <span className="font-display text-danger" aria-hidden="true">✕</span>
                        </motion.button>
                      ) : (
                        <motion.div
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="sketch-dashed flex min-h-14 items-center justify-center text-xs font-bold text-ink-soft"
                        >
                          スロット{i + 1}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>

            {/* ステータス */}
            <div className="mt-4 flex flex-col gap-2.5">
              <StatRow label="おもさ" value={build.weight} />
              <StatRow label="すべり" value={build.slip} />
              <StatRow label="サイズ" value={build.size} />
            </div>

            {/* 特殊効果チップ */}
            <div className="mt-3 flex min-h-7 flex-wrap gap-1.5" aria-live="polite">
              <AnimatePresence>
                {chips.map((c) => (
                  <motion.span
                    key={c}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-deep"
                  >
                    {c}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>

            {/* 説明ノート */}
            <div className="bg-graph sketch-dashed mt-3 min-h-20 p-3 text-sm leading-relaxed">
              {detail ? (
                <>
                  <span className="font-display">{detail.emoji} {detail.name}</span>
                  <br />
                  {detail.detail}
                </>
              ) : (
                <span className="text-ink-soft">カードにふれると、ここにせつめいが出るよ ✍️</span>
              )}
            </div>

            <SketchButton variant="primary" onClick={confirm} className="mt-4 w-full text-xl">
              {mode !== '1p' && player < count - 1
                ? `つぎは ${playerLabel(mode, (player + 1) as PlayerId)} →`
                : 'バトルへ ▶'}
            </SketchButton>
            <p className="mt-2 text-center text-xs font-bold text-ink-soft">
              ギアは 0〜2こ でOK({sel.length}/2)
            </p>
          </div>
        </aside>

        {/* ギアカードグリッド */}
        <section className="min-w-0 flex-1" aria-label="文房具ギアいちらん">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {GEARS.map((g, i) => {
              const selected = sel.includes(g.id)
              const slotNo = sel.indexOf(g.id) + 1
              return (
                <motion.li
                  key={g.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i, duration: 0.25 }}
                >
                  <motion.button
                    type="button"
                    onClick={() => toggle(g.id)}
                    onHoverStart={() => setDetail(g)}
                    onFocus={() => setDetail(g)}
                    onTapStart={() => setDetail(g)}
                    aria-pressed={selected}
                    whileHover={{ y: -4, rotate: i % 2 ? 1 : -1 }}
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                    className={cx(
                      'sketch relative flex min-h-[104px] w-full flex-col items-start gap-1 p-3 text-left transition-colors duration-150',
                      selected
                        ? 'bg-primary-soft shadow-sketch-sm'
                        : 'bg-white shadow-sketch-sm hover:bg-paper-deep',
                    )}
                    style={selected ? { boxShadow: `0 0 0 3px ${color}, 2px 3px 0 rgba(66,32,6,.75)` } : undefined}
                  >
                    {selected && (
                      <motion.span
                        initial={{ scale: 0, rotate: -30 }}
                        animate={{ scale: 1, rotate: -10 }}
                        className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full font-num text-sm font-bold text-white"
                        style={{ background: color }}
                        aria-hidden="true"
                      >
                        {slotNo}
                      </motion.span>
                    )}
                    <span className="text-3xl" aria-hidden="true">{g.emoji}</span>
                    <span className="font-display text-[15px] leading-tight">{g.name}</span>
                    <span className="text-xs font-bold leading-snug text-ink-soft">{g.short}</span>
                  </motion.button>
                </motion.li>
              )
            })}
          </ul>
        </section>
      </div>

      {/* 交代 / CPU装備 オーバーレイ */}
      <AnimatePresence>
        {overlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4"
            role="status"
          >
            <motion.div
              initial={{ scale: 0.6, rotate: -4, opacity: 0 }}
              animate={{ scale: 1, rotate: -1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20 }}
              className="sketch relative bg-white px-10 py-8 text-center shadow-sketch"
            >
              <Tape className="-top-3 left-1/2 -translate-x-1/2" tone={overlay.kind === 'swap' ? 'pink' : 'yellow'} />
              {overlay.kind === 'swap' ? (
                <>
                  <p className="text-4xl" aria-hidden="true">🔄</p>
                  <p className="mt-2 font-display text-3xl" style={{ color: PLAYER_COLORS[overlay.next] }}>
                    {playerLabel(mode, overlay.next)}のばん!
                  </p>
                  <p className="mt-1 text-sm font-bold text-ink-soft">たんまつを わたしてね</p>
                </>
              ) : (
                <>
                  <p className="font-display text-2xl">CPUのそうびは…</p>
                  <div className="mt-3 flex justify-center gap-4">
                    {overlay.gears.map((id, i) => (
                      <motion.span
                        key={id}
                        initial={{ scale: 0, rotate: 20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.3 + i * 0.25, type: 'spring', stiffness: 400, damping: 15 }}
                        className="sketch-alt flex flex-col items-center gap-1 bg-paper-deep px-4 py-2"
                      >
                        <span className="text-3xl" aria-hidden="true">{gearById(id).emoji}</span>
                        <span className="font-display text-xs">{gearById(id).name}</span>
                      </motion.span>
                    ))}
                  </div>
                  <p className="mt-3 font-display text-lg text-primary-deep">バトルスタート!</p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
