// リザルト画面: 勝者演出 + 紙吹雪
import { useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { PLAYER_COLORS, gearById, playerLabel, type Mode, type PlayerId } from '../game/data'
import { sfx } from '../game/sound'
import { EraserSVG, SketchButton, Tape } from '../components/ui'

export interface MatchResult {
  winner: PlayerId
  score: number[]
  loadouts: string[][]
}

const CONFETTI_COLORS = ['#f97316', '#2563eb', '#e11d48', '#facc15', '#22c55e']

export default function ResultScreen({
  mode,
  result,
  onRematch,
  onChangeGear,
  onChangeStage,
  onTitle,
}: {
  mode: Mode
  result: MatchResult
  onRematch: () => void
  onChangeGear: () => void
  onChangeStage: () => void
  onTitle: () => void
}) {
  const reduced = useReducedMotion()
  const playedRef = useRef(false)
  useEffect(() => {
    if (playedRef.current) return
    playedRef.current = true
    if (mode === '1p' && result.winner === 1) sfx.lose()
    else sfx.win()
  }, [mode, result.winner])
  const confetti = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 7 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 1.6,
        dur: 2.6 + Math.random() * 2,
        rot: (Math.random() - 0.5) * 900,
        round: Math.random() > 0.5,
      })),
    [],
  )
  const winnerName = playerLabel(mode, result.winner)
  const playerLost = mode === '1p' && result.winner === 1
  const winnerGears = result.loadouts[result.winner].map((id) => gearById(id).emoji)

  return (
    <div className="bg-notebook relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* 紙吹雪 */}
      {!reduced && !playerLost && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          {confetti.map((c) => (
            <motion.span
              key={c.id}
              className="absolute top-0 block"
              style={{
                left: `${c.left}%`,
                width: c.size,
                height: c.size * (c.round ? 1 : 0.55),
                background: c.color,
                borderRadius: c.round ? '50%' : 2,
              }}
              initial={{ y: -40, opacity: 1 }}
              animate={{ y: '108dvh', rotate: c.rot, opacity: [1, 1, 0.7] }}
              transition={{
                duration: c.dur,
                delay: c.delay,
                repeat: Infinity,
                ease: 'easeIn',
              }}
            />
          ))}
        </div>
      )}

      <motion.div
        initial={{ scale: 0.7, opacity: 0, rotate: -3 }}
        animate={{ scale: 1, opacity: 1, rotate: -1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="sketch relative w-full max-w-md bg-white px-6 pb-8 pt-12 text-center shadow-sketch"
      >
        <Tape className="-top-3 left-8 -rotate-6" tone={(['blue', 'pink', 'yellow'] as const)[result.winner]} />
        <Tape className="-top-3 right-8 rotate-6" />
        <p className="font-display text-lg tracking-[0.3em] text-ink-soft">けっかはっぴょう</p>

        <motion.div
          initial={{ y: 18 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 14 }}
          className="mx-auto -mb-2 mt-2 w-48"
        >
          <EraserSVG
            color={PLAYER_COLORS[result.winner]}
            emojis={winnerGears}
            mood="win"
            label={`勝者 ${winnerName} の消しゴム`}
          />
        </motion.div>

        <motion.h2
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 320, damping: 14 }}
          className="font-display text-5xl leading-tight"
          style={{ color: PLAYER_COLORS[result.winner] }}
        >
          {winnerName}のかち!
        </motion.h2>

        <p className="mt-3 font-num text-3xl font-bold tracking-widest text-ink">
          {result.score.map((s, i) => (
            <span key={i}>
              {i > 0 && <span className="text-ink-soft"> - </span>}
              <span style={{ color: PLAYER_COLORS[i] }}>{s}</span>
            </span>
          ))}
        </p>
        <p className="mt-1 text-sm font-bold text-ink-soft">
          {playerLost ? 'そうびをかえて リベンジだ!' : 'すばらしい はじきっぷり!'}
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <SketchButton variant="primary" onClick={onRematch} className="w-full text-xl">
            🔁 もういちど たたかう
          </SketchButton>
          <div className="grid grid-cols-2 gap-3">
            <SketchButton variant="accent" onClick={onChangeGear} className="w-full !px-2 text-base">
              🎒 そうびを かえる
            </SketchButton>
            <SketchButton variant="accent" onClick={onChangeStage} className="w-full !px-2 text-base">
              🗺️ ステージを かえる
            </SketchButton>
          </div>
          <SketchButton variant="ghost" onClick={onTitle} className="w-full">
            🏠 タイトルへ
          </SketchButton>
        </div>
      </motion.div>
    </div>
  )
}
