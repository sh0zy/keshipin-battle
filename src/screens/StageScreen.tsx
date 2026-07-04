// ステージ選択画面: ミニプレビュー付きカード
import { motion } from 'framer-motion'
import { PLAYER_COLORS, type Mode } from '../game/data'
import { DESK } from '../game/physics'
import { STAGES, STAGES_3P, type Stage } from '../game/stages'
import { SketchButton, Tape } from '../components/ui'

export default function StageScreen({
  mode,
  onSelect,
  onBack,
}: {
  mode: Mode
  onSelect: (s: Stage) => void
  onBack: () => void
}) {
  const list = mode === '3p' ? STAGES_3P : STAGES
  return (
    <div className="bg-notebook flex min-h-dvh flex-col items-center px-4 pb-10 pt-5">
      <header className="flex w-full max-w-3xl items-center justify-between gap-3">
        <SketchButton variant="ghost" onClick={onBack} className="!min-h-11 !px-4 text-base">
          ← もどる
        </SketchButton>
        <h1 className="font-display text-2xl sm:text-3xl">
          <span className="marker-swipe">
            {mode === '3p' ? '3人ステージをえらぼう' : 'ステージをえらぼう'}
          </span>
        </h1>
        <span className="w-24" aria-hidden="true" />
      </header>

      <ul className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {list.map((s, i) => (
          <motion.li
            key={s.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.25 }}
          >
            <motion.button
              type="button"
              onClick={() => onSelect(s)}
              whileHover={{ y: -5, rotate: i % 2 ? 1 : -1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="sketch relative flex w-full items-center gap-4 bg-white p-4 text-left shadow-sketch transition-colors hover:bg-paper-deep"
            >
              <Tape
                tone={(['yellow', 'blue', 'pink'] as const)[i % 3]}
                className="-top-3 right-8 rotate-3 !w-14"
              />
              <StagePreview stage={s} />
              <span className="min-w-0 flex-1">
                <span className="block text-3xl" aria-hidden="true">
                  {s.emoji}
                </span>
                <span className="mt-1 block font-display text-xl leading-tight">{s.name}</span>
                <span className="mt-1.5 block text-xs font-bold leading-snug text-ink-soft">
                  {s.desc}
                </span>
              </span>
              <span className="self-end font-display text-2xl text-ink" aria-hidden="true">
                ▶
              </span>
            </motion.button>
          </motion.li>
        ))}
      </ul>

      <p className="mt-8 text-sm font-medium text-ink-soft">
        {mode === '3p'
          ? '⚖️ ラウンドごとに じんちが こうたいするから みんな公平!'
          : '🗺️ ステージによって かちかたが かわるぞ!'}
      </p>
    </div>
  )
}

/* ミニプレビュー: ワールド座標 → 96x148 のSVGに縮小 */
function StagePreview({ stage }: { stage: Stage }) {
  const PX = 10
  const PY = 10
  const PW = 76
  const PH = 128
  const rnd = stage.round
  // 丸テーブルは等倍スケールで中央配置、長方形は机をボックスにフィット
  const k = rnd ? PW / (rnd.r * 2 + 24) : 1
  const cxP = PX + PW / 2
  const cyP = PY + PH / 2
  const mx = (x: number) => (rnd ? cxP + (x - rnd.x) * k : PX + ((x - DESK.x) / DESK.w) * PW)
  const my = (y: number) => (rnd ? cyP + (y - rnd.y) * k : PY + ((y - DESK.y) / DESK.h) * PH)
  const mw = (w: number) => (rnd ? w * k : (w / DESK.w) * PW)
  const mh = (h: number) => (rnd ? h * k : (h / DESK.h) * PH)
  return (
    <svg viewBox="0 0 96 148" className="w-20 shrink-0" aria-hidden="true">
      {stage.round ? (
        <ellipse
          cx={mx(stage.round.x)}
          cy={my(stage.round.y)}
          rx={mw(stage.round.r) + 4}
          ry={mh(stage.round.r) + 4}
          fill="#d9a05b"
          stroke="#7c4a21"
          strokeWidth="3"
        />
      ) : (
        <rect x={PX - 4} y={PY - 4} width={PW + 8} height={PH + 8} rx="7" fill="#d9a05b" stroke="#7c4a21" strokeWidth="3" />
      )}
      {stage.walls.map((w, i) => (
        <rect
          key={i}
          x={mx(w.x)}
          y={my(w.y)}
          width={mw(w.w)}
          height={mh(w.h)}
          rx="2.5"
          fill={w.kind === 'pencil' ? '#fbbf24' : '#5b7291'}
          stroke="#422006"
          strokeWidth="1.5"
        />
      ))}
      {stage.holes.map((h, i) => (
        <circle key={i} cx={mx(h.x)} cy={my(h.y)} r={mw(h.r)} fill="#2b2350" stroke="#171233" strokeWidth="1.5" />
      ))}
      {stage.spinner && (
        <g>
          <line
            x1={mx(stage.spinner.x - stage.spinner.length)}
            y1={my(stage.spinner.y)}
            x2={mx(stage.spinner.x + stage.spinner.length)}
            y2={my(stage.spinner.y)}
            stroke="#a8b6c8"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx={mx(stage.spinner.x)} cy={my(stage.spinner.y)} r="4" fill="#e2e8f0" stroke="#422006" strokeWidth="1.3" />
        </g>
      )}
      {stage.tilt && (
        <g>
          <path
            d={`M ${mx(DESK.x + DESK.w / 2) - 13} ${my(DESK.y + DESK.h / 2)} h 18`}
            stroke="#7c4a21"
            strokeWidth="3"
            strokeDasharray="4 3"
            opacity="0.7"
          />
          <path
            d={`M ${mx(DESK.x + DESK.w / 2) + 5} ${my(DESK.y + DESK.h / 2) - 5} l 9 5 l -9 5 z`}
            fill="#7c4a21"
            opacity="0.7"
          />
        </g>
      )}
      {stage.spawn3
        ? stage.spawn3.map((cluster, pi) =>
            cluster.map(([x, y], si) => (
              <circle
                key={`${pi}-${si}`}
                cx={mx(x)}
                cy={my(y)}
                r="4.5"
                fill={PLAYER_COLORS[pi]}
                stroke="#422006"
                strokeWidth="1.2"
              />
            )),
          )
        : [-140, 0, 140].map((o) => (
            <g key={o}>
              <circle cx={mx(DESK.x + DESK.w / 2 + o)} cy={my(DESK.y + 66)} r="4.5" fill="#e11d48" stroke="#422006" strokeWidth="1.2" />
              <circle cx={mx(DESK.x + DESK.w / 2 + o)} cy={my(DESK.y + DESK.h - 66)} r="4.5" fill="#2563eb" stroke="#422006" strokeWidth="1.2" />
            </g>
          ))}
    </svg>
  )
}
