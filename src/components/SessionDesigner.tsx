import { useState } from 'react'
import type { DayPlan, PlanConfig, Zone } from '../lib/types'
import type { SessionDesign, SessionOption } from '../lib/aiPlanner'
import { getLabel } from '../lib/labelUtils'

const ZONE_BADGE: Record<Zone, string> = {
  recovery:   'bg-gray-100 text-gray-700 border-gray-300',
  easy:       'bg-green-100 text-green-800 border-green-300',
  moderate:   'bg-yellow-100 text-yellow-800 border-yellow-300',
  hard:       'bg-orange-100 text-orange-800 border-orange-300',
  'flat out': 'bg-red-100 text-red-800 border-red-300',
}

const DIFF_BADGE: Record<'same' | 'up' | 'down', { label: string; style: string }> = {
  same: { label: 'same zone', style: 'bg-gray-50 text-gray-500 border-gray-200' },
  up:   { label: '↑ one step harder', style: 'bg-orange-50 text-orange-600 border-orange-200' },
  down: { label: '↓ one step easier', style: 'bg-blue-50 text-blue-600 border-blue-200' },
}

function fmtMin(m: number) {
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

interface Props {
  designs: SessionDesign[]
  plan: DayPlan[]
  config: PlanConfig
  onApply: (changes: { id: string; zone: Zone; notes: string }[]) => void
  onClose: () => void
}

export function SessionDesigner({ designs, plan, config, onApply, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [picks, setPicks] = useState<Record<string, number>>({})

  const current = designs[currentIndex]
  const allSessions = plan.flatMap(d => d.sessions)
  const session = allSessions.find(s => s.id === current.sessionId)
  const day = plan.find(d => d.sessions.some(s => s.id === current.sessionId))
  const sport = config.sports.find(s => s.id === session?.sportId)
  const pickedIndex = picks[current.sessionId] ?? -1
  const isLast = currentIndex === designs.length - 1

  function pick(optIndex: number) {
    setPicks(p => ({ ...p, [current.sessionId]: optIndex }))
  }

  function next() {
    if (pickedIndex === -1) return
    if (isLast) {
      const changes = designs
        .map(d => {
          const idx = picks[d.sessionId] ?? 0
          const opt = d.options[idx] ?? d.options[0]
          return opt ? { id: d.sessionId, zone: opt.zone, notes: opt.notes } : null
        })
        .filter((c): c is { id: string; zone: typeof designs[number]['options'][number]['zone']; notes: string } => c !== null)
      onApply(changes)
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  function prev() {
    if (currentIndex > 0) setCurrentIndex(i => i - 1)
  }

  if (!session || !current) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">🎯 Design Sessions</h2>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg leading-none">✕</button>
          </div>
          {/* Progress */}
          <div className="flex gap-1 mb-3">
            {designs.map((_, i) => (
              <div key={i} className={`h-1 rounded-full flex-1 transition-colors ${
                i < currentIndex ? 'bg-purple-500' : i === currentIndex ? 'bg-purple-300' : 'bg-gray-100'
              }`} />
            ))}
          </div>
          {/* Session info */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: sport?.color ?? '#6b7280' }}
            >
              {sport?.icon ?? '🏋️'}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {day?.day} — {sport?.name ?? session.sportId}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize border ${ZONE_BADGE[session.zone]}`}>{session.zone}</span>
                <span className="text-xs text-gray-400">{fmtMin(session.durationMin)}</span>
                <span className="text-xs text-gray-300">Session {currentIndex + 1} of {designs.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
          <p className="text-xs text-gray-400 mb-1">Choose a workout option:</p>
          {current.options.map((opt: SessionOption, i: number) => {
            const diff = DIFF_BADGE[opt.zoneDiff]
            const selected = pickedIndex === i
            const label = sport ? getLabel(sport, opt.zone) : opt.zone
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  selected ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize border ${ZONE_BADGE[opt.zone]}`}>{opt.zone}</span>
                  {opt.zoneDiff !== 'same' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${diff.style}`}>{diff.label}</span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">{label}</span>
                </div>
                <p className="text-sm text-gray-700 font-medium leading-snug">{opt.notes}</p>
                <p className="text-xs text-gray-400 mt-1.5 italic">✦ {opt.pro}</p>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={currentIndex === 0 ? onClose : prev}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >{currentIndex === 0 ? 'Cancel' : '← Back'}</button>
          <button
            onClick={next}
            disabled={pickedIndex === -1}
            className="px-5 py-2 text-sm font-bold rounded-xl text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-200 disabled:cursor-not-allowed transition-colors"
          >
            {isLast ? '✓ Apply All' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
