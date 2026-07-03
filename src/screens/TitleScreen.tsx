// タイトル画面: ロゴ + モード選択 + CPUの強さ選択
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { CpuLevel, Mode } from '../game/data'
import { EraserSVG, MuteButton, SketchButton, Tape } from '../components/ui'

const FLOATERS = [
  { e: '✏️', x: '8%', y: '14%', d: 0 },
  { e: '📏', x: '86%', y: '10%', d: 0.6 },
  { e: '✂️', x: '12%', y: '74%', d: 1.1 },
  { e: '📎', x: '90%', y: '68%', d: 0.3 },
  { e: '🖍️', x: '76%', y: '84%', d: 0.9 },
  { e: '🧲', x: '20%', y: '42%', d: 1.4 },
]

const LOGO_CHARS: { c: string; color: string }[] = [
  { c: '消', color: 'var(--color-accent)' },
  { c: 'し', color: 'var(--color-ink)' },
  { c: 'ピ', color: 'var(--color-primary)' },
  { c: 'ン', color: 'var(--color-ink)' },
]

const CPU_LEVELS: { level: CpuLevel; emoji: string; name: string; desc: string }[] = [
  { level: 'easy', emoji: '🐣', name: 'よわい', desc: 'ねらいが てきとう。れんしゅうに!' },
  { level: 'normal', emoji: '🙂', name: 'ふつう', desc: 'ちかくの敵を まっすぐねらう' },
  { level: 'hard', emoji: '😈', name: 'つよい', desc: 'ふちへの押し出しを けいさんしてくる' },
]

export default function TitleScreen({
  onSelect,
}: {
  onSelect: (m: Mode, cpu?: CpuLevel) => void
}) {
  const reduced = useReducedMotion()
  const [pickCpu, setPickCpu] = useState(false)
  return (
    <div className="bg-notebook relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <MuteButton className="absolute right-4 top-4" />
      {/* 浮かぶ文房具 */}
      {FLOATERS.map((f) => (
        <motion.span
          key={f.e}
          aria-hidden="true"
          className="pointer-events-none absolute select-none text-4xl opacity-60 sm:text-5xl"
          style={{ left: f.x, top: f.y }}
          animate={reduced ? undefined : { y: [0, -14, 0], rotate: [-6, 6, -6] }}
          transition={{ duration: 4.5, repeat: Infinity, delay: f.d, ease: 'easeInOut' }}
        >
          {f.e}
        </motion.span>
      ))}

      {/* ロゴカード */}
      <motion.div
        initial={{ y: 30, opacity: 0, rotate: -2 }}
        animate={{ y: 0, opacity: 1, rotate: -1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 18 }}
        className="sketch relative bg-white px-8 pb-8 pt-10 text-center shadow-sketch sm:px-14"
      >
        <Tape className="-top-3 left-1/2 -translate-x-1/2 -rotate-3" />
        <p className="font-display text-lg tracking-[0.35em] text-ink-soft">ぶんぼうぐバトル</p>
        <h1 aria-label="消しピン" className="mt-1 font-display text-7xl leading-none sm:text-8xl">
          {LOGO_CHARS.map((ch, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className={i === 2 ? 'marker-swipe inline-block' : 'inline-block'}
              style={{ color: ch.color }}
              initial={{ y: -46, opacity: 0, rotate: i % 2 ? 8 : -8 }}
              animate={{ y: 0, opacity: 1, rotate: i % 2 ? 3 : -3 }}
              transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.15 + i * 0.09 }}
            >
              {ch.c}
            </motion.span>
          ))}
        </h1>
        <p className="wavy-underline mt-5 font-display text-base text-ink sm:text-lg">
          ゆびで はじいて、あいてを つくえから おとせ!
        </p>
        <motion.div
          className="pointer-events-none absolute -right-10 -top-9 hidden w-28 sm:block"
          animate={reduced ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <EraserSVG color="var(--color-accent)" label="消しゴムのキャラクター" />
        </motion.div>
      </motion.div>

      {/* モード選択 / CPUの強さ選択 */}
      <div className="mt-12 w-full max-w-2xl">
        <AnimatePresence mode="wait" initial={false}>
          {!pickCpu ? (
            <motion.div
              key="modes"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="flex w-full flex-col gap-5 sm:flex-row"
            >
              <ModeCard
                emoji="🤖"
                title="ひとりで"
                desc="CPUと しんけんしょうぶ"
                tone="accent"
                onClick={() => setPickCpu(true)}
              />
              <ModeCard
                emoji="🧑‍🤝‍🧑"
                title="ふたりで"
                desc="1つの がめんで こうたいバトル"
                tone="pink"
                onClick={() => onSelect('2p')}
              />
            </motion.div>
          ) : (
            <motion.div
              key="cpu"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="flex w-full flex-col items-center gap-4"
            >
              <p className="font-display text-xl">
                <span className="marker-swipe">CPUの つよさは?</span>
              </p>
              <div className="flex w-full flex-col gap-4 sm:flex-row">
                {CPU_LEVELS.map((c, i) => (
                  <motion.button
                    key={c.level}
                    type="button"
                    onClick={() => onSelect('1p', c.level)}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.06 * i, type: 'spring', stiffness: 380, damping: 22 }}
                    whileHover={{ y: -4, rotate: i === 1 ? 0 : i ? 1.2 : -1.2 }}
                    whileTap={{ scale: 0.95 }}
                    className="sketch flex-1 bg-white px-5 py-5 text-left shadow-sketch transition-colors hover:bg-paper-deep"
                  >
                    <span className="text-3xl" aria-hidden="true">{c.emoji}</span>
                    <span className="mt-1 block font-display text-2xl text-accent-deep">{c.name}</span>
                    <span className="mt-1 block text-xs font-bold leading-snug text-ink-soft">{c.desc}</span>
                  </motion.button>
                ))}
              </div>
              <SketchButton variant="ghost" onClick={() => setPickCpu(false)} className="!min-h-11 text-base">
                ← もどる
              </SketchButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-10 text-sm font-medium text-ink-soft">
        ✏️ 3本しょうぶ ─ さきに2ラウンドとったら かち!
      </p>
    </div>
  )
}

function ModeCard({
  emoji,
  title,
  desc,
  tone,
  onClick,
}: {
  emoji: string
  title: string
  desc: string
  tone: 'accent' | 'pink'
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -5, rotate: tone === 'accent' ? -1.2 : 1.2 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className="sketch relative flex-1 bg-white px-6 py-6 text-left shadow-sketch transition-colors hover:bg-paper-deep"
    >
      <Tape tone={tone === 'accent' ? 'blue' : 'pink'} className="-top-3 right-6 rotate-6 !w-16" />
      <span className="text-4xl" aria-hidden="true">
        {emoji}
      </span>
      <span
        className="mt-2 block font-display text-3xl"
        style={{ color: tone === 'accent' ? 'var(--color-accent)' : 'var(--color-p2)' }}
      >
        {title}
      </span>
      <span className="mt-1 block text-sm font-bold text-ink-soft">{desc}</span>
      <span className="absolute bottom-5 right-5 font-display text-2xl text-ink" aria-hidden="true">
        ▶
      </span>
    </motion.button>
  )
}
