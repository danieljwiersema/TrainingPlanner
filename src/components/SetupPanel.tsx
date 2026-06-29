import { useState } from 'react'
import type { PlanConfig, WeekIntensity, SportDef, WeekIntensity as WI } from '../lib/types'
import { SportTargetRow } from './SportTargetRow'
import { AddSportForm } from './AddSportForm'
import { InfoIcon } from './Tooltip'

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const INTENSITIES: WeekIntensity[] = ['light', 'moderate', 'hard', 'peak']

function getDayLabel(weekStart: string, offset: number): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  return DAY_SHORT[new Date(y, m - 1, d + offset).getDay()]
}

const INTENSITY_COLORS: Record<WeekIntensity, string> = {
  light:    'bg-green-100 text-green-800 border-green-300',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  hard:     'bg-orange-100 text-orange-800 border-orange-300',
  peak:     'bg-red-100 text-red-800 border-red-300',
}

function getThisMonday(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  config: PlanConfig
  onChange: (config: PlanConfig) => void
  onShowTemplates: () => void
  aiError: string | null
  aiPrompt: string
  onAiPromptChange: (v: string) => void
}

export function SetupPanel({ config, onChange, onShowTemplates, aiError, aiPrompt, onAiPromptChange }: Props) {
  const [showAddSport, setShowAddSport] = useState(false)

  function setDay(i: number, val: string) {
    const mins = Math.max(0, Math.min(240, Number(val) || 0))
    const next = [...config.dailyMinutes]
    next[i] = mins
    onChange({ ...config, dailyMinutes: next })
  }

  function setPreferredTime(i: number, time: string | undefined) {
    const next: (string | undefined)[] = [...(config.preferredStartTimes ?? Array(7).fill(undefined))]
    next[i] = time
    onChange({ ...config, preferredStartTimes: next })
  }

  function setSessions(sportId: string, n: number | 'auto') {
    onChange({
      ...config,
      targets: {
        ...config.targets,
        [sportId]: { ...config.targets[sportId], sessionsPerWeek: typeof n === 'number' ? Math.max(0, Math.min(7, n)) : n },
      },
    })
  }

  function setMinutes(sportId: string, raw: string) {
    const val = raw === '' ? undefined : Number(raw)
    onChange({
      ...config,
      targets: {
        ...config.targets,
        [sportId]: { ...config.targets[sportId], minutesPerWeek: val },
      },
    })
  }

  function setIntensity(sportId: string, intensity: WI | undefined) {
    onChange({
      ...config,
      targets: {
        ...config.targets,
        [sportId]: { ...config.targets[sportId], intensity },
      },
    })
  }

  function addSport(name: string, icon: string, color: string) {
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    const sport: SportDef = { id, name, icon, color }
    onChange({
      ...config,
      sports: [...config.sports, sport],
      targets: { ...config.targets, [id]: { sessionsPerWeek: 1 } },
    })
    setShowAddSport(false)
  }

  function removeSport(id: string) {
    const nextSports = config.sports.filter(s => s.id !== id)
    const { [id]: _, ...restTargets } = config.targets
    onChange({
      ...config,
      sports: nextSports,
      focus: config.focus === id ? (nextSports[0]?.id ?? '') : config.focus,
      targets: restTargets,
    })
  }

  const totalSessions = Object.values(config.targets).reduce((n, t) => n + (t.sessionsPerWeek === 'auto' ? 1 : (t.sessionsPerWeek ?? 0)), 0)
  const availableDays = config.dailyMinutes.filter(m => m > 0).length

  return (
    <div className="w-64 shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-y-auto">
      <div className="p-5 space-y-6">

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Week Starting</p>
            <button
              onClick={onShowTemplates}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium"
            >Templates</button>
          </div>
          <input
            type="date"
            value={config.weekStartDate}
            onChange={e => onChange({ ...config, weekStartDate: e.target.value || getThisMonday() })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div>
          <div className="flex items-center mb-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sports & Sessions</p>
            <InfoIcon tooltip="Click a sport name to set it as the focus sport. The focus sport gets harder zone assignments and scheduling priority." />
          </div>

          <div className="space-y-3">
            {config.sports.map(sport => (
              <SportTargetRow
                key={sport.id}
                sport={sport}
                target={config.targets[sport.id] ?? { sessionsPerWeek: 0 }}
                isFocus={config.focus === sport.id}
                onSetFocus={() => onChange({ ...config, focus: sport.id })}
                onRemove={() => removeSport(sport.id)}
                onSetSessions={n => setSessions(sport.id, n)}
                onSetMinutes={raw => setMinutes(sport.id, raw)}
                onSetIntensity={intensity => setIntensity(sport.id, intensity)}
              />
            ))}
          </div>

          {totalSessions > 0 && (
            <p className={`text-xs mt-3 ${totalSessions > availableDays ? 'text-amber-600' : 'text-gray-400'}`}>
              {totalSessions} sessions across {availableDays} available day{availableDays !== 1 ? 's' : ''}
              {totalSessions > availableDays ? ' — some days will have 2 sessions' : ''}
            </p>
          )}

          <div className="mt-3">
            {showAddSport ? (
              <AddSportForm onAdd={addSport} onCancel={() => setShowAddSport(false)} />
            ) : (
              <button onClick={() => setShowAddSport(true)}
                className="w-full py-2 text-xs border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
              >+ Add Sport</button>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Default Intensity</p>
            <InfoIcon tooltip="Controls how hard the overall week is. Applies to all sports unless overridden per-sport above." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {INTENSITIES.map(w => (
              <button key={w}
                onClick={() => onChange({ ...config, weekIntensity: w })}
                className={`px-3 py-2 rounded-xl text-sm font-medium border capitalize transition-colors ${
                  config.weekIntensity === w ? INTENSITY_COLORS[w] + ' border-2' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}
              >{w}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Schedule Length</p>
          </div>
          <div className="flex gap-1.5">
            {[3, 4, 5, 6, 7].map(n => (
              <button
                key={n}
                onClick={() => onChange({ ...config, numDays: n })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  (config.numDays ?? 7) === n
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}
              >{n}d</button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Time Available</p>
            <InfoIcon tooltip="Set daily time budget and optional session start time. The scheduler fills the budget with sessions." />
          </div>
          <div className="space-y-2">
            {Array.from({ length: config.numDays ?? 7 }, (_, i) => {
              const day = getDayLabel(config.weekStartDate, i)
              const mins = config.dailyMinutes[i] ?? 0
              const prefTime = config.preferredStartTimes?.[i] ?? ''
              return (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 w-7">{day}</span>
                    <div className="flex items-center gap-2">
                      {mins > 0 && (
                        <input
                          type="time"
                          value={prefTime}
                          onChange={e => setPreferredTime(i, e.target.value || undefined)}
                          title="Preferred session start time"
                          className="text-xs text-gray-400 border border-gray-100 rounded px-1 py-0.5 w-[72px] focus:outline-none focus:ring-1 focus:ring-blue-300"
                        />
                      )}
                      <span className="text-xs text-gray-500 font-medium w-12 text-right">
                        {mins === 0 ? 'Rest' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range" min={0} max={240} step={15}
                    value={mins}
                    onChange={e => setDay(i, e.target.value)}
                    className="w-full accent-blue-500"
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* AI note — buttons moved to top of plan view */}
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">✨ AI Note</p>
          <p className="text-xs text-gray-400">Tip for AI Generate button above ↑</p>
          <textarea
            value={aiPrompt}
            onChange={e => onAiPromptChange(e.target.value)}
            placeholder="e.g. 'Race on Sunday, no hard sessions Friday'"
            rows={2}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-600 placeholder-gray-300"
          />
          {aiError && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-2.5 py-1.5 leading-snug">{aiError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
