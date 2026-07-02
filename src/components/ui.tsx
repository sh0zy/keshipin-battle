// 共有UI: 手描きボタン / テープ / ステータスバー / 消しゴムSVG
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BASE_STAT, STAT_MAX } from '../game/data'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* ---------------- 手描きボタン ---------------- */
export function SketchButton({
  variant = 'primary',
  className,
  children,
  onClick,
  ariaLabel,
  disabled,
}: {
  variant?: 'primary' | 'accent' | 'ghost' | 'danger'
  className?: string
  children: ReactNode
  onClick?: () => void
  ariaLabel?: string
  disabled?: boolean
}) {
  const palette = {
    primary: 'bg-primary hover:bg-[#fb923c] text-ink',
    accent: 'bg-accent hover:bg-accent-deep text-white',
    ghost: 'bg-white hover:bg-paper-deep text-ink',
    danger: 'bg-danger hover:bg-[#b91c1c] text-white',
  }[variant]
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2, rotate: -0.6 }}
      whileTap={disabled ? undefined : { scale: 0.96, y: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className={cx(
        'sketch shadow-sketch inline-flex min-h-12 select-none items-center justify-center gap-2 px-6 py-2.5',
        'font-display text-lg leading-none transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        palette,
        className,
      )}
    >
      {children}
    </motion.button>
  )
}

/* ---------------- マスキングテープ ---------------- */
export function Tape({
  className,
  tone = 'yellow',
}: {
  className?: string
  tone?: 'yellow' | 'blue' | 'pink'
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'tape-strip',
        tone === 'blue' && 'tape-strip--blue',
        tone === 'pink' && 'tape-strip--pink',
        className,
      )}
    />
  )
}

/* ---------------- ステータスバー ---------------- */
export function StatRow({ label, value }: { label: string; value: number }) {
  const delta = value - BASE_STAT
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-display text-sm">{label}</span>
      <div
        className="flex min-w-0 flex-1 gap-1"
        role="img"
        aria-label={`${label} ${value} (基本${BASE_STAT})`}
      >
        {Array.from({ length: STAT_MAX }, (_, i) => (
          <motion.span
            key={i}
            animate={{ scale: i < value ? [1, 1.25, 1] : 1 }}
            transition={{ duration: 0.3 }}
            className={cx(
              'relative h-4 flex-1 rounded-[3px] border-2',
              i < value
                ? 'hatch border-ink/70 bg-primary'
                : 'border-ink/20 bg-white',
            )}
          >
            {i === BASE_STAT - 1 && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 right-[-3px] h-6 w-0.5 bg-ink/40"
              />
            )}
          </motion.span>
        ))}
      </div>
      <motion.span
        key={value}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        className="w-5 shrink-0 text-right font-num text-lg font-bold leading-none"
      >
        {value}
      </motion.span>
      <span
        className={cx(
          'w-9 shrink-0 rounded-full px-1 py-0.5 text-center text-xs font-bold',
          delta > 0 && 'bg-accent text-white',
          delta < 0 && 'bg-danger text-white',
          delta === 0 && 'invisible',
        )}
      >
        {delta > 0 ? `+${delta}` : delta}
      </span>
    </div>
  )
}

/* ---------------- 消しゴムSVG (プレビュー / リザルト) ---------------- */
export function EraserSVG({
  color,
  emojis = [],
  mood = 'happy',
  label,
  className,
}: {
  color: string
  emojis?: string[]
  mood?: 'happy' | 'win' | 'lose'
  label?: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 200 150"
      className={className}
      role="img"
      aria-label={label ?? '消しゴム'}
    >
      <ellipse cx="100" cy="128" rx="62" ry="10" fill="rgba(66,32,6,0.15)" />
      <g transform="rotate(-4 100 80)">
        {/* 本体 */}
        <rect x="34" y="52" width="132" height="60" rx="10" fill="#fbf3e4" stroke="#422006" strokeWidth="4.5" />
        <rect x="38" y="90" width="124" height="18" rx="8" fill="rgba(66,32,6,0.07)" />
        {/* スリーブ */}
        <rect x="74" y="47" width="52" height="70" rx="7" fill={color} stroke="#422006" strokeWidth="4.5" />
        <line x1="82" y1="52" x2="82" y2="112" stroke="rgba(255,255,255,0.55)" strokeWidth="3" />
        <line x1="118" y1="52" x2="118" y2="112" stroke="rgba(255,255,255,0.55)" strokeWidth="3" />
        {/* 顔 */}
        {mood === 'lose' ? (
          <g stroke="#422006" strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M44 72 l10 8 M54 72 l-10 8" />
            <path d="M44 92 q8 -6 16 0" />
          </g>
        ) : (
          <g fill="#422006">
            <circle cx="47" cy="76" r="3.6" />
            <circle cx="61" cy="76" r="3.6" />
            <path d="M46 88 q8 8 16 0" stroke="#422006" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            {mood === 'win' && (
              <>
                <path d="M40 68 q4 -5 8 0" stroke="#422006" strokeWidth="2.5" fill="none" />
                <path d="M54 68 q4 -5 8 0" stroke="#422006" strokeWidth="2.5" fill="none" />
              </>
            )}
          </g>
        )}
        {/* きらり */}
        <g stroke="#f97316" strokeWidth="3" strokeLinecap="round">
          <path d="M150 40 v10 M145 45 h10" />
        </g>
      </g>
      {/* ギアバッジ */}
      {emojis.slice(0, 2).map((e, i) => (
        <g key={i} transform={`translate(${146 + i * -34} ${34 + i * -12})`}>
          <circle r="17" fill="white" stroke="#422006" strokeWidth="3.5" />
          <text textAnchor="middle" dy="6" fontSize="18">
            {e}
          </text>
        </g>
      ))}
      {mood === 'win' && (
        <text x="96" y="26" textAnchor="middle" fontSize="30" transform="rotate(-6 96 26)">
          👑
        </text>
      )}
    </svg>
  )
}
