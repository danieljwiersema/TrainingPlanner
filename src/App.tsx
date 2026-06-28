import { useState } from 'react'
import type { PlanConfig, DayPlan, PlanWarning } from './lib/types'
import { DEFAULT_SPORTS } from './lib/types'
import { generatePlan, emptyPlan } from './lib/scheduler'
import { validatePlan } from './lib/validator'
import { SetupPanel } from './components/SetupPanel'
import { WeeklyGrid } from './components/WeeklyGrid'
import { CalendarView } from './components/CalendarView'

type Tab = 'plan' | 'calendar'

function getThisMonday(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

const DEFAULT_CONFIG: PlanConfig = {
  sports: DEFAULT_SPORTS,
  focus: 'run',
  weekIntensity: 'moderate',
  weekStartDate: getThisMonday(),
  dailyMinutes: [60, 0, 90, 45, 0, 120, 60],
  targets: {
    swim:     { sessionsPerWeek: 2 },
    bike:     { sessionsPerWeek: 1 },
    run:      { sessionsPerWeek: 3 },
    strength: { sessionsPerWeek: 1 },
  },
}

export default function App() {
  const [tab, setTab] = useState<Tab>('plan')
  const [config, setConfig] = useState<PlanConfig>(DEFAULT_CONFIG)
  const [plan, setPlan] = useState<DayPlan[]>(() => emptyPlan(DEFAULT_CONFIG))
  const [warnings, setWarnings] = useState<PlanWarning[]>([])

  function applyPlan(next: DayPlan[]) {
    setPlan(next)
    setWarnings(validatePlan(next, config))
  }

  function handleGenerate() {
    applyPlan(generatePlan(config, plan))
  }

  function handleRegenerate() {
    applyPlan(generatePlan(config, plan))
  }

  function handleConfigChange(next: PlanConfig) {
    setConfig(next)
    // Rebuild empty days if week start date changed
    if (next.weekStartDate !== config.weekStartDate) {
      setPlan(emptyPlan(next))
      setWarnings([])
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 shrink-0">
        <span className="text-2xl">🗓️</span>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-none">Training Planner</h1>
          <p className="text-xs text-gray-400 mt-0.5">Plan your week across all your sports</p>
        </div>

        <div className="ml-8 flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('plan')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'plan' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Weekly Plan
          </button>
          <button
            onClick={() => setTab('calendar')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Calendar View
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {tab === 'plan' && (
          <SetupPanel config={config} onChange={handleConfigChange} onGenerate={handleGenerate} />
        )}

        <main className="flex-1 p-6 overflow-y-auto">
          {tab === 'plan' ? (
            <WeeklyGrid
              plan={plan}
              warnings={warnings}
              config={config}
              onChange={applyPlan}
              onRegenerate={handleRegenerate}
            />
          ) : (
            <CalendarView plan={plan} config={config} onChange={applyPlan} />
          )}
        </main>
      </div>
    </div>
  )
}
