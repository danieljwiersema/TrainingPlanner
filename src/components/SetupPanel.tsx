import { useState } from 'react'
import type { PlanConfig, SportDef } from '../lib/types'
import { SportTargetRow } from './SportTargetRow'
import { AddSportForm } from './AddSportForm'
import { InfoIcon } from './Tooltip'
import { resolveSessionCount } from '../lib/scheduler'

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDayLabel(weekStart: string, offset: number): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  return DAY_SHORT[new Date(y, m - 1, d + offset).getDay()]
}

function getThisMonday(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtMin(m: number): string {
  if (m === 0) return '0m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

interface Props {
  config: PlanConfig
  onChange: (config: PlanConfig) => void
  onShowTemplates: () => void
}

export function SetupPanel({ config, onChange, onShowTemplates }: Props) {
  const [showAddSport, setShowAddSport] = useState(false)

  function setDay(i: number, val: string) {
    const mins = Math.max(0, Math.min(360, Number(val) || 0))
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

  function setMinutes(sportId: string, val: number | 'default' | undefined) {
    onChange({
      ...config,
      targets: { ...config.targets, [sportId]: { ...config.targets[sportId], minutesPerWeek: val } },
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
    if (config.sports.length <= 1) {
      window.alert('You need at least one sport. Add another before removing this one.')
      return
    }
    const nextSports = config.sports.filter(s => s.id !== id)
    const { [id]: _, ...restTargets } = config.targets
    onChange({
      ...config,
      sports: nextSports,
      focus: config.focus === id ? nextSports[0].id : config.focus,
      targets: restTargets,
    })
  }

  // Compute resolved default minutes per sport
  const totalAvailable = config.dailyMinutes.reduce((a, b) => a + b, 0)
  const weeklyGoal = config.weeklyMinuteGoal ?? totalAvailable
  const explicitTotal = config.sports.reduce((sum, s) => {
    const m = config.targets[s.id]?.minutesPerWeek
    return sum + (typeof m === 'number' ? m : 0)
  }, 0)
  const defaultSports = config.sports.filter(s => config.targets[s.id]?.minutesPerWeek === 'default')
  const remainingForDefault = Math.max(0, weeklyGoal - explicitTotal)
  const totalDefaultSessions = defaultSports.reduce(
    (sum, s) => sum + resolveSessionCount(s, config.targets[s.id], config.dailyMinutes),
    0,
  )
  const resolvedDefaultMin: Record<string, number> = {}
  for (const sport of defaultSports) {
    const sessions = resolveSessionCount(sport, config.targets[sport.id], config.dailyMinutes)
    resolvedDefaultMin[sport.id] = totalDefaultSessions > 0
      ? Math.round((sessions / totalDefaultSessions) * remainingForDefault)
      : 0
  }

  // Mismatch detection
  const hasDefaultSports = defaultSports.length > 0
  const hasWeeklyGoal = config.weeklyMinuteGoal !== undefined
  const goalVsAvailable = hasWeeklyGoal ? weeklyGoal - totalAvailable : 0
  const explicitVsGoal = explicitTotal > weeklyGoal && weeklyGoal > 0
  const showMismatch = (hasDefaultSports || hasWeeklyGoal) && (Math.abs(goalVsAvailable) > 15 || explicitVsGoal)

  const totalSessions = Object.values(config.targets).reduce((n, t) => n + (t.sessionsPerWeek === 'auto' ? 1 : (t.sessionsPerWeek ?? 0)), 0)
  const availableDays = config.dailyMinutes.filter(m => m > 0).length

  return (
    <div className="w-64 shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-y-auto">
      <div className="p-5 space-y-6">

        {/* Week starting */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Week Starting</p>
            <button onClick={onShowTemplates} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Templates</button>
          </div>
          <input
            type="date"
            value={config.weekStartDate}
            onChange={e => onChange({ ...config, weekStartDate: e.target.value || getThisMonday() })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Schedule length — moved up */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Schedule Length</p>
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

        {/* Time available */}
        <div>
          <div className="flex items-center mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Time Available</p>
            <InfoIcon tooltip="Set daily time budget and optional session start time." />
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
                        {mins === 0 ? 'Rest' : fmtMin(mins)}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range" min={0} max={360} step={15}
                    value={mins}
                    onChange={e => setDay(i, e.target.value)}
                    className="w-full accent-blue-500"
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Sports & Sessions */}
        <div>
          <div className="flex items-center mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Weekly Time Goal</p>
            <InfoIcon tooltip="Total weekly training time target. Sports set to 'default' min/week share this budget proportionally." />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range" min={0} max={1200} step={15}
              value={config.weeklyMinuteGoal ?? 0}
              onChange={e => onChange({ ...config, weeklyMinuteGoal: Number(e.target.value) || undefined })}
              className="flex-1 accent-purple-500"
            />
            <span className="text-xs font-semibold text-gray-600 w-14 text-right shrink-0">
              {config.weeklyMinuteGoal ? fmtMin(config.weeklyMinuteGoal) : 'off'}
            </span>
          </div>
          {showMismatch && (
            <div className={`mt-2 px-2.5 py-2 rounded-lg text-xs leading-snug border ${
              explicitVsGoal
                ? 'bg-red-50 border-red-200 text-red-700'
                : goalVsAvailable > 15
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}>
              {explicitVsGoal
                ? `⚠ Sport targets (${fmtMin(explicitTotal)}) exceed weekly goal (${fmtMin(weeklyGoal)})`
                : goalVsAvailable > 15
                  ? `⚠ Goal (${fmtMin(weeklyGoal)}) exceeds available time (${fmtMin(totalAvailable)})`
                  : `ℹ Goal (${fmtMin(weeklyGoal)}) is ${fmtMin(Math.abs(goalVsAvailable))} ${goalVsAvailable < 0 ? 'under' : 'over'} available time (${fmtMin(totalAvailable)})`
              }
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center mb-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sports & Sessions</p>
            <InfoIcon tooltip="Click a sport name to set it as the focus sport. Use 'default' min/week to share the weekly goal proportionally." />
          </div>

          <div className="space-y-3">
            {config.sports.map(sport => (
              <SportTargetRow
                key={sport.id}
                sport={sport}
                target={config.targets[sport.id] ?? { sessionsPerWeek: 0 }}
                isFocus={config.focus === sport.id}
                resolvedDefaultMin={resolvedDefaultMin[sport.id]}
                onSetFocus={() => onChange({ ...config, focus: sport.id })}
                onRemove={() => removeSport(sport.id)}
                onSetSessions={n => setSessions(sport.id, n)}
                onSetMinutes={val => setMinutes(sport.id, val)}
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

      </div>
    </div>
  )
}
