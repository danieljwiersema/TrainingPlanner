import { useState } from 'react'
import type { PlanConfig } from '../lib/types'
import type { WizardAnswers, FollowUpQuestion } from '../lib/aiPlanner'

const PURPOSE_CHIPS = [
  'Improve general fitness',
  'Prepare for a race or event',
  'Build strength',
  'Lose weight',
  'Return from injury',
  'Improve technique',
]

const LEVELS: { id: WizardAnswers['level']; label: string; desc: string }[] = [
  { id: 'beginner',     label: 'Beginner',     desc: 'Less than 1 year training' },
  { id: 'intermediate', label: 'Intermediate', desc: '1–3 years, training regularly' },
  { id: 'advanced',     label: 'Advanced',     desc: '3+ years, competing or serious goals' },
  { id: 'elite',        label: 'Elite',        desc: 'High-level competition or coaching' },
]

const WEAKNESS_TAGS = [
  'Endurance', 'Speed', 'Strength', 'Technique',
  'Recovery', 'Flexibility', 'Mental toughness', 'Sport-specific skill',
]

type Step = 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'evaluating' | 'followup' | 'generating'

interface Props {
  config: PlanConfig
  onGenerate: (answers: WizardAnswers, followUpAnswers: Record<string, string>, followUpQuestions: FollowUpQuestion[]) => void
  onEvaluate: (answers: WizardAnswers) => Promise<{ ready: boolean; questions?: FollowUpQuestion[] }>
  onClose: () => void
}

export function AIWizard({ config, onGenerate, onEvaluate, onClose }: Props) {
  const [step, setStep] = useState<Step>('q1')
  const [purpose, setPurpose] = useState('')
  const [level, setLevel] = useState<WizardAnswers['level']>('intermediate')
  const [levelNote, setLevelNote] = useState('')
  const [weaknesses, setWeaknesses] = useState<string[]>([])
  const [weaknessNote, setWeaknessNote] = useState('')
  const [injuries, setInjuries] = useState('')
  const [setupMode, setSetupMode] = useState<WizardAnswers['setupMode']>('current')
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([])
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({})

  const STEPS: Step[] = ['q1', 'q2', 'q3', 'q4', 'q5']
  const stepIndex = STEPS.indexOf(step as Step)
  const isFormStep = stepIndex >= 0

  const answers: WizardAnswers = { purpose, level, levelNote, weaknesses, weaknessNote, injuries, setupMode }

  function toggleWeakness(tag: string) {
    setWeaknesses(w => w.includes(tag) ? w.filter(t => t !== tag) : [...w, tag])
  }

  async function handleQ5Next() {
    setStep('evaluating')
    try {
      const result = await onEvaluate(answers)
      if (!result.ready && result.questions?.length) {
        setFollowUpQuestions(result.questions)
        setStep('followup')
      } else {
        setStep('generating')
        onGenerate(answers, {}, [])
      }
    } catch {
      // If evaluation fails just proceed
      setStep('generating')
      onGenerate(answers, {}, [])
    }
  }

  function handleFollowUpNext() {
    setStep('generating')
    onGenerate(answers, followUpAnswers, followUpQuestions)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">✨ AI Training Plan</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
          {isFormStep && (
            <div className="flex items-center gap-1.5">
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= stepIndex ? 'bg-purple-500' : 'bg-gray-100'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex-1 overflow-y-auto">

          {/* Q1 — Purpose */}
          {step === 'q1' && (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold text-gray-800 mb-1">What is your training goal?</p>
                <p className="text-xs text-gray-400 mb-3">Describe in your own words — or tap a suggestion below.</p>
                <textarea
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  placeholder="e.g. Prepare for a 5km fun run in 6 weeks"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-300"
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {PURPOSE_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => setPurpose(chip)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      purpose === chip
                        ? 'bg-purple-100 text-purple-700 border-purple-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >{chip}</button>
                ))}
              </div>
            </div>
          )}

          {/* Q2 — Level */}
          {step === 'q2' && (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold text-gray-800 mb-1">What is your experience level?</p>
                <p className="text-xs text-gray-400 mb-3">This shapes session intensity and volume.</p>
                <div className="grid grid-cols-2 gap-2">
                  {LEVELS.map(l => (
                    <button
                      key={l.id}
                      onClick={() => setLevel(l.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-colors ${
                        level === l.id
                          ? 'bg-purple-50 border-purple-400 text-purple-900'
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <p className="text-sm font-semibold">{l.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{l.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Any nuance? <span className="text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={levelNote}
                  onChange={e => setLevelNote(e.target.value)}
                  placeholder={`e.g. "Advanced runner but new to ${config.sports.find(s => s.id !== config.focus)?.name ?? 'swimming'}"`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-300"
                />
              </div>
            </div>
          )}

          {/* Q3 — Weaknesses */}
          {step === 'q3' && (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold text-gray-800 mb-1">Any weak areas or targeted focuses?</p>
                <p className="text-xs text-gray-400 mb-3">Select all that apply — or skip if none.</p>
                <div className="flex flex-wrap gap-2">
                  {WEAKNESS_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleWeakness(tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        weaknesses.includes(tag)
                          ? 'bg-orange-100 text-orange-700 border-orange-300'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >{tag}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tell us more <span className="text-gray-400">(optional)</span></label>
                <textarea
                  value={weaknessNote}
                  onChange={e => setWeaknessNote(e.target.value)}
                  placeholder="e.g. Rowing catch timing, gym squat strength, long run pacing"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-300"
                />
              </div>
            </div>
          )}

          {/* Q4 — Injuries */}
          {step === 'q4' && (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold text-gray-800 mb-1">Any injuries or physical constraints?</p>
                <p className="text-xs text-gray-400 mb-3">The AI will avoid aggravating these and suggest alternatives. Leave blank if none.</p>
                <textarea
                  value={injuries}
                  onChange={e => setInjuries(e.target.value)}
                  placeholder="e.g. Sore left knee — avoid running hills. Lower back tightness. Recovering from shoulder strain."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-300"
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {['No injuries', 'Knee pain', 'Back pain', 'Shoulder issue', 'Ankle / foot', 'Hip tightness'].map(chip => (
                  <button
                    key={chip}
                    onClick={() => setInjuries(chip === 'No injuries' ? '' : chip)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      (chip === 'No injuries' && injuries === '') || injuries === chip
                        ? 'bg-purple-100 text-purple-700 border-purple-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >{chip}</button>
                ))}
              </div>
            </div>
          )}

          {/* Q5 — Setup mode */}
          {step === 'q5' && (
            <div className="space-y-3">
              <div>
                <p className="text-base font-semibold text-gray-800 mb-1">How should the AI handle your schedule?</p>
                <p className="text-xs text-gray-400 mb-3">Your daily time budgets are always respected.</p>
              </div>
              <button
                onClick={() => setSetupMode('current')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  setupMode === 'current'
                    ? 'bg-blue-50 border-blue-400'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <p className="text-sm font-semibold text-gray-800">Use my current setup</p>
                <p className="text-xs text-gray-500 mt-1">Respects your sport targets, session counts, and daily time slots exactly as configured.</p>
              </button>
              <button
                onClick={() => setSetupMode('ai-decides')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  setupMode === 'ai-decides'
                    ? 'bg-purple-50 border-purple-400'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <p className="text-sm font-semibold text-gray-800">AI decides within my limits</p>
                <p className="text-xs text-gray-500 mt-1">AI chooses which days to train, session lengths, and sport distribution — without ever exceeding your daily time budgets.</p>
              </button>
            </div>
          )}

          {/* Evaluating */}
          {step === 'evaluating' && (
            <div className="py-8 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Reviewing your answers…</p>
            </div>
          )}

          {/* Follow-up questions */}
          {step === 'followup' && (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold text-gray-800 mb-1">A couple more things…</p>
                <p className="text-xs text-gray-400 mb-3">These will help the AI tailor your plan more precisely.</p>
              </div>
              {followUpQuestions.map(q => (
                <div key={q.id}>
                  <label className="text-sm font-medium text-gray-700 block mb-2">{q.question}</label>
                  {q.type === 'select' && q.options ? (
                    <div className="flex flex-wrap gap-2">
                      {q.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setFollowUpAnswers(a => ({ ...a, [q.id]: opt }))}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            followUpAnswers[q.id] === opt
                              ? 'bg-purple-100 text-purple-700 border-purple-300'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >{opt}</button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={followUpAnswers[q.id] ?? ''}
                      onChange={e => setFollowUpAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Generating */}
          {step === 'generating' && (
            <div className="py-8 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Building your training plan…</p>
              <p className="text-xs text-gray-400">This takes about 5–10 seconds</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {isFormStep && (
          <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                const prev = STEPS[stepIndex - 1]
                if (prev) setStep(prev)
                else onClose()
              }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium"
            >{stepIndex === 0 ? 'Cancel' : '← Back'}</button>

            {step !== 'q5' ? (
              <button
                onClick={() => setStep(STEPS[stepIndex + 1] as Step)}
                disabled={step === 'q1' && !purpose.trim()}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-200 text-white font-semibold rounded-xl text-sm transition-colors"
              >Next →</button>
            ) : (
              <button
                onClick={handleQ5Next}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm transition-colors"
              >Generate Plan ✨</button>
            )}
          </div>
        )}

        {step === 'followup' && (
          <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleFollowUpNext}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-sm transition-colors"
            >Generate Plan ✨</button>
          </div>
        )}
      </div>
    </div>
  )
}
