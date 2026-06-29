import { useState } from 'react'
import type { PlanConfig } from '../lib/types'
import { TEMPLATES } from '../lib/templates'

interface Props {
  weekStartDate: string
  onSelectTemplate: (config: PlanConfig) => void
  onSkip: () => void
}

const STEPS = [
  {
    icon: '🗓️',
    title: 'Plan your whole week',
    body: 'Lay out training across every sport you do, balanced around the time you actually have each day.',
  },
  {
    icon: '⚡',
    title: 'Three simple steps',
    body: 'Set your sports and weekly time → Generate Schedule to fill the week → Optimise Intensity with AI to make it hard where it counts.',
  },
]

export function WelcomeModal({ weekStartDate, onSelectTemplate, onSkip }: Props) {
  const [screen, setScreen] = useState(0)
  const onIntro = screen < STEPS.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">

        {onIntro ? (
          <div className="px-7 py-8 text-center">
            <span className="text-5xl block mb-4">{STEPS[screen].icon}</span>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{STEPS[screen].title}</h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">{STEPS[screen].body}</p>

            <div className="flex items-center justify-center gap-1.5 mt-6 mb-6">
              {STEPS.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === screen ? 'w-6 bg-blue-500' : 'w-1.5 bg-gray-200'}`} />
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={onSkip} className="text-sm text-gray-400 hover:text-gray-600 font-medium">Skip</button>
              <button
                onClick={() => setScreen(s => s + 1)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors"
              >{screen === STEPS.length - 1 ? 'Choose a sport →' : 'Next →'}</button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-6 space-y-4">
            <div>
              <h2 className="font-bold text-gray-900 text-lg">What are you training for?</h2>
              <p className="text-sm text-gray-400 mt-0.5">Pick a starting point — you can change everything after.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => onSelectTemplate({ ...t.config, weekStartDate })}
                  className="p-4 rounded-xl border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50 text-left transition-colors space-y-1"
                >
                  <span className="text-2xl block">{t.icon}</span>
                  <p className="font-semibold text-gray-800 text-sm">{t.name}</p>
                  <p className="text-xs text-gray-400 leading-snug">{t.description}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setScreen(STEPS.length - 1)} className="text-sm text-gray-400 hover:text-gray-600 font-medium">← Back</button>
              <button onClick={onSkip} className="text-sm text-gray-400 hover:text-gray-600 font-medium">Skip — set up manually</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
