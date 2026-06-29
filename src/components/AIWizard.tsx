import { useState } from 'react'
import type { PlanConfig } from '../lib/types'
import type { CoachAnswers } from '../lib/aiPlanner'

type Step = 'mode' | 'goal' | 'tolerance' | 'hardSports' | 'weaknesses' | 'injuries'
const STEPS: Step[] = ['mode', 'goal', 'tolerance', 'hardSports', 'weaknesses', 'injuries']

const STEP_TITLES: Record<Step, string> = {
  mode:       'What should the AI do?',
  goal:       "What's your training goal?",
  tolerance:  'How many hard sessions this week?',
  hardSports: 'Which sports get the hard work?',
  weaknesses: 'Any areas to focus on?',
  injuries:   'Any injuries to work around?',
}

const INJURY_CHIPS = ['No injuries', 'Knee', 'Lower back', 'Shoulder', 'Achilles / calf', 'Hip', 'Foot / ankle']

const GOAL_CHIPS = [
  'Race preparation', 'Build aerobic base', 'Improve speed', 'Weight loss',
  'General fitness', 'Post-race recovery', 'Competition season maintenance',
]

const WEAKNESS_TAGS = [
  'Lactate threshold', 'VO2max', 'Aerobic base', 'Race pacing', 'Brick transitions',
  'Run economy', 'Swim catch', 'Open water technique', 'Bike power output',
  'Strength endurance', 'Mental toughness', 'Recovery between sessions', 'Sprint finish',
]

interface Props {
  config: PlanConfig
  onOptimise: (answers: CoachAnswers) => void
  onClose: () => void
}

export function AIWizard({ config, onOptimise, onClose }: Props) {
  const [step, setStep] = useState<Step>('mode')
  const [mode, setMode] = useState<CoachAnswers['mode']>('intensity')
  const [goal, setGoal] = useState('')
  const [hardTolerance, setHardTolerance] = useState<CoachAnswers['hardTolerance']>(2)
  const [hardSports, setHardSports] = useState<string[]>(
    config.focus && config.sports.some(s => s.id === config.focus)
      ? [config.focus]
      : config.sports.map(s => s.id),
  )
  const [weaknesses, setWeaknesses] = useState<string[]>([])
  const [customWeakness, setCustomWeakness] = useState('')
  const [injuries, setInjuries] = useState('')

  const stepIndex = STEPS.indexOf(step)
  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  function prev() {
    if (!isFirst) setStep(STEPS[stepIndex - 1])
  }

  function next() {
    if (isLast) {
      onOptimise({ mode, goal, hardTolerance, hardSports, weaknesses, injuries: injuries.trim() || undefined })
    } else {
      setStep(STEPS[stepIndex + 1])
    }
  }

  function canAdvance() {
    if (step === 'goal') return goal.trim().length > 0
    if (step === 'hardSports') return hardSports.length > 0
    return true
  }

  function toggleWeakness(tag: string) {
    setWeaknesses(w => w.includes(tag) ? w.filter(x => x !== tag) : [...w, tag])
  }

  function toggleHardSport(id: string) {
    setHardSports(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">✨ Optimise Session Plans</h2>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg leading-none">✕</button>
          </div>
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 rounded-full flex-1 transition-colors ${i <= stepIndex ? 'bg-purple-500' : 'bg-gray-100'}`} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">{STEP_TITLES[step]}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex-1 overflow-y-auto">

          {step === 'mode' && (
            <div className="space-y-3">
              <button
                onClick={() => setMode('intensity')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${mode === 'intensity' ? 'bg-purple-50 border-purple-400' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
              >
                <p className="text-sm font-semibold text-gray-800">Optimise intensity only</p>
                <p className="text-xs text-gray-500 mt-1">AI assigns the right zone to each session — easy, hard, recovery — based on your goal and tolerance. Sessions stay as-is otherwise.</p>
              </button>
              <button
                onClick={() => setMode('design')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${mode === 'design' ? 'bg-purple-50 border-purple-400' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
              >
                <p className="text-sm font-semibold text-gray-800">Add workout notes to every session</p>
                <p className="text-xs text-gray-500 mt-1">AI assigns intensity zones AND writes specific workout notes for every session — sets, reps, pace targets, HR zones, drills.</p>
              </button>
            </div>
          )}

          {step === 'goal' && (
            <div className="space-y-3">
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="e.g. Preparing for an Olympic triathlon in 8 weeks. Want to improve run off the bike."
                rows={3}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-300"
              />
              <div className="flex flex-wrap gap-2">
                {GOAL_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => setGoal(chip)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      goal === chip ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >{chip}</button>
                ))}
              </div>
            </div>
          )}

          {step === 'tolerance' && (
            <div className="space-y-3">
              {(['auto', 1, 2, 3, 'max'] as const).map(val => (
                <button
                  key={String(val)}
                  onClick={() => setHardTolerance(val)}
                  className={`w-full p-3.5 rounded-xl border-2 text-left transition-colors ${hardTolerance === val ? 'bg-purple-50 border-purple-400' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                >
                  <p className="text-sm font-semibold text-gray-800">
                    {val === 'auto' ? "Not sure — let the AI decide" : val === 1 ? '1 hard session' : val === 2 ? '2 hard sessions' : val === 3 ? '3 hard sessions' : 'As many as possible'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {val === 'auto'
                      ? 'Recommended if you’re unsure — the AI picks a sensible, conservative amount for your level and goal.'
                      : val === 1
                        ? 'One key quality effort. Good for base building or high fatigue weeks.'
                        : val === 2
                          ? 'Two quality sessions — classic polarised approach. Suitable for most training phases.'
                          : val === 3
                            ? 'Three hard sessions — high stimulus. Only if well rested and in a peak block.'
                            : 'AI decides how hard to push based on your sessions and goal.'}
                  </p>
                </button>
              ))}
            </div>
          )}

          {step === 'hardSports' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-3">Only these sports will receive hard or flat-out sessions. All others stay easy or recovery.</p>
              {config.sports.map(sport => {
                const selected = hardSports.includes(sport.id)
                return (
                  <button
                    key={sport.id}
                    onClick={() => toggleHardSport(sport.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-colors ${selected ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <span className="text-lg">{sport.icon}</span>
                    <span className="text-sm font-medium text-gray-800 flex-1 text-left">{sport.name}</span>
                    {sport.id === config.focus && <span className="text-xs text-gray-400">focus</span>}
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}>
                      {selected && <span className="text-white text-xs leading-none">✓</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {step === 'weaknesses' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">Optional — helps the AI target the right energy systems and write better session notes.</p>
              <div className="flex flex-wrap gap-2">
                {WEAKNESS_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleWeakness(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      weaknesses.includes(tag) ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >{tag}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customWeakness}
                  onChange={e => setCustomWeakness(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customWeakness.trim()) {
                      toggleWeakness(customWeakness.trim())
                      setCustomWeakness('')
                    }
                  }}
                  placeholder="Add custom focus area…"
                  className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-300"
                />
                <button
                  onClick={() => { if (customWeakness.trim()) { toggleWeakness(customWeakness.trim()); setCustomWeakness('') } }}
                  disabled={!customWeakness.trim()}
                  className="px-3 py-2 text-xs bg-purple-600 text-white rounded-lg disabled:opacity-40 font-medium"
                >Add</button>
              </div>
              {weaknesses.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {weaknesses.map(w => (
                    <span key={w} className="flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium border border-purple-200">
                      {w}
                      <button onClick={() => toggleWeakness(w)} className="text-purple-400 hover:text-purple-700 leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'injuries' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">Optional — the AI will avoid intensity or workouts that could aggravate anything you list.</p>
              <textarea
                value={injuries}
                onChange={e => setInjuries(e.target.value)}
                placeholder="e.g. Sore left knee — avoid hard running and downhill. Recovering shoulder — easy swim only."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-300"
              />
              <div className="flex flex-wrap gap-2">
                {INJURY_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => setInjuries(chip === 'No injuries' ? '' : (injuries ? `${injuries}, ${chip}` : chip))}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 transition-colors"
                  >{chip}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={isFirst ? onClose : prev}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >{isFirst ? 'Cancel' : '← Back'}</button>
          <button
            onClick={next}
            disabled={!canAdvance()}
            className="px-5 py-2 text-sm font-bold rounded-xl text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-200 disabled:cursor-not-allowed transition-colors"
          >
            {isLast
              ? mode === 'intensity' ? '✨ Optimise Intensity' : '✨ Add Workout Notes'
              : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
