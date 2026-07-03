// 画面ステートマシン + ページめくり風トランジション
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CpuLevel, Mode, PlayerId } from './game/data'
import { STAGES, type Stage } from './game/stages'
import { playBgm, primeAudio } from './game/sound'
import TitleScreen from './screens/TitleScreen'
import StageScreen from './screens/StageScreen'
import GearScreen from './screens/GearScreen'
import BattleScreen from './screens/BattleScreen'
import ResultScreen, { type MatchResult } from './screens/ResultScreen'

type Screen = 'title' | 'stage' | 'gear' | 'battle' | 'result'

export default function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [mode, setMode] = useState<Mode>('1p')
  const [cpuLevel, setCpuLevel] = useState<CpuLevel>('normal')
  const [stage, setStage] = useState<Stage>(STAGES[0])
  const [loadouts, setLoadouts] = useState<[string[], string[]]>([[], []])
  const [result, setResult] = useState<MatchResult | null>(null)
  const [battleKey, setBattleKey] = useState(0)

  // autoplay 制限対策: 最初の操作で AudioContext を起こす
  useEffect(() => {
    const h = () => primeAudio()
    window.addEventListener('pointerdown', h, { once: true })
    return () => window.removeEventListener('pointerdown', h)
  }, [])

  // 画面ごとにBGMを切り替え (バトル中のサドンデス切替は BattleScreen 側)
  useEffect(() => {
    playBgm(screen === 'battle' ? 'battle' : screen === 'result' ? 'result' : 'title')
  }, [screen])

  const startBattle = () => {
    setBattleKey((k) => k + 1)
    setScreen('battle')
  }

  return (
    <main className="min-h-dvh bg-paper font-body text-ink">
      <AnimatePresence mode="wait">
        <motion.div
          key={screen === 'battle' ? `battle-${battleKey}` : screen}
          initial={{ opacity: 0, y: 28, rotate: -0.4 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          exit={{ opacity: 0, y: -22, rotate: 0.4 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          {screen === 'title' && (
            <TitleScreen
              onSelect={(m, cpu) => {
                setMode(m)
                if (cpu) setCpuLevel(cpu)
                setScreen('stage')
              }}
            />
          )}
          {screen === 'stage' && (
            <StageScreen
              onBack={() => setScreen('title')}
              onSelect={(s) => {
                setStage(s)
                setScreen('gear')
              }}
            />
          )}
          {screen === 'gear' && (
            <GearScreen
              mode={mode}
              cpuLevel={cpuLevel}
              initial={loadouts}
              onBack={() => setScreen('stage')}
              onDone={(l) => {
                setLoadouts(l)
                startBattle()
              }}
            />
          )}
          {screen === 'battle' && (
            <BattleScreen
              mode={mode}
              cpuLevel={cpuLevel}
              stage={stage}
              loadouts={loadouts}
              onExit={() => setScreen('title')}
              onFinish={(winner: PlayerId, score: [number, number]) => {
                setResult({ winner, score, loadouts })
                setScreen('result')
              }}
            />
          )}
          {screen === 'result' && result && (
            <ResultScreen
              mode={mode}
              result={result}
              onRematch={startBattle}
              onChangeGear={() => setScreen('gear')}
              onChangeStage={() => setScreen('stage')}
              onTitle={() => setScreen('title')}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  )
}
