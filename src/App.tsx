import { useState, useEffect, useRef } from 'react'
import type { PlanConfig, DayPlan, PlanWarning } from './lib/types'
import { DEFAULT_SPORTS } from './lib/types'
import { generatePlan, emptyPlan, addDays } from './lib/scheduler'
import { validatePlan } from './lib/validator'
import { optimiseSessions, designSessions } from './lib/aiPlanner'
import type { CoachAnswers, SessionDesign } from './lib/aiPlanner'
import { getLabel } from './lib/labelUtils'
import { SessionDesigner } from './components/SessionDesigner'
import { AIWizard } from './components/AIWizard'
import { useGoogleCalendar } from './hooks/useGoogleCalendar'
import { SetupPanel } from './components/SetupPanel'
import { WeeklyGrid } from './components/WeeklyGrid'
import { CalendarView } from './components/CalendarView'
import { TemplateSelector } from './components/TemplateSelector'
import { WelcomeModal } from './components/WelcomeModal'

type Tab = 'plan' | 'calendar'

function getThisMonday(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

function loadSavedConfig(): PlanConfig {
  try {
    const s = localStorage.getItem('tplanner-config')
    if (s) return { ...DEFAULT_CONFIG, ...JSON.parse(s) }
  } catch {}
  return DEFAULT_CONFIG
}

function loadSavedPlan(cfg: PlanConfig): DayPlan[] {
  try {
    const s = localStorage.getItem(`tplanner-plan-${cfg.weekStartDate}`)
    if (s) {
      const saved = JSON.parse(s) as DayPlan[]
      // Always rebuild day structure fresh (correct dates/names), only restore sessions
      return emptyPlan(cfg).map((day, i) => ({ ...day, sessions: saved[i]?.sessions ?? [] }))
    }
  } catch {}
  return emptyPlan(cfg)
}

export default function App() {
  const [tab, setTab] = useState<Tab>('plan')
  const [config, setConfig] = useState<PlanConfig>(loadSavedConfig)
  const [plan, setPlan] = useState<DayPlan[]>(() => loadSavedPlan(loadSavedConfig()))
  const [warnings, setWarnings] = useState<PlanWarning[]>([])
  const [history, setHistory] = useState<DayPlan[][]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('tplanner-config'))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiNotice, setAiNotice] = useState<string | null>(null)
  const [showAIWizard, setShowAIWizard] = useState(false)
  const [sessionDesigns, setSessionDesigns] = useState<SessionDesign[] | null>(null)
  const [justGenerated, setJustGenerated] = useState(false)

  async function handleDesignSessions(selectedIds: string[], injuries?: string) {
    setAiLoading(true)
    setAiError(null)
    setAiNotice(null)
    try {
      const designs = await designSessions(config, plan, selectedIds, injuries)
      // Drop any session the AI returned with no usable options
      const usable = designs.filter(d => d.options.length > 0)
      if (usable.length === 0) {
        setAiError("The AI couldn't design those sessions — please try again.")
      } else {
        if (usable.length < designs.length) {
          setAiNotice(`Designed ${usable.length} of ${designs.length} sessions — the rest came back empty.`)
        }
        setSessionDesigns(usable)
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Session design failed')
    } finally {
      setAiLoading(false)
    }
  }

  function handleApplyDesigns(changes: { id: string; zone: import('./lib/types').Zone; notes: string }[]) {
    const updated = plan.map(day => ({
      ...day,
      sessions: day.sessions.map(session => {
        const change = changes.find(c => c.id === session.id)
        if (!change) return session
        const sport = config.sports.find(s => s.id === session.sportId)
        return { ...session, zone: change.zone, label: sport ? getLabel(sport, change.zone) : change.zone, notes: change.notes || session.notes }
      }),
    }))
    applyPlan(updated)
    setSessionDesigns(null)
  }

  async function handleAIOptimise(answers: CoachAnswers) {
    setAiLoading(true)
    setAiError(null)
    setAiNotice(null)
    setShowAIWizard(false)
    setJustGenerated(false)
    try {
      const changes = await optimiseSessions(config, plan, answers)
      let changeCount = 0
      const updated = plan.map(day => ({
        ...day,
        sessions: day.sessions.map(session => {
          const change = changes.find(c => c.id === session.id)
          if (!change) return session
          if (change.zone !== session.zone || (change.notes && change.notes !== session.notes)) changeCount++
          const sport = config.sports.find(s => s.id === session.sportId)
          return {
            ...session,
            zone: change.zone,
            label: sport ? getLabel(sport, change.zone) : change.zone,
            notes: change.notes ?? session.notes,
          }
        }),
      }))
      applyPlan(updated)
      setAiNotice(changeCount > 0
        ? `Updated intensity on ${changeCount} session${changeCount > 1 ? 's' : ''}.`
        : 'Your plan already matched the AI’s recommendation — no changes needed.')
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI optimisation failed')
    } finally {
      setAiLoading(false)
    }
  }

  const gcal = useGoogleCalendar(plan, config)

  // Persist config
  useEffect(() => {
    localStorage.setItem('tplanner-config', JSON.stringify(config))
  }, [config])

  // Persist plan by week
  useEffect(() => {
    localStorage.setItem(`tplanner-plan-${config.weekStartDate}`, JSON.stringify(plan))
  }, [plan, config.weekStartDate])

  // Keyboard undo (⌘Z / Ctrl+Z)
  const undoFn = useRef<() => void>(() => {})
  useEffect(() => { undoFn.current = undo })
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoFn.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function applyPlan(next: DayPlan[]) {
    setHistory(h => [...h.slice(-9), plan])
    setPlan(next)
    setWarnings(validatePlan(next, config))
  }

  function undo() {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setPlan(prev)
    setWarnings(validatePlan(prev, config))
  }

  function switchWeek(newConfig: PlanConfig) {
    setConfig(newConfig)
    const next = loadSavedPlan(newConfig)
    setPlan(next)
    setWarnings(validatePlan(next, newConfig))
    setHistory([])
  }

  function handleGenerate() {
    applyPlan(generatePlan(config, plan))
    setJustGenerated(true)
  }

  function handleConfigChange(next: PlanConfig) {
    const weekChanged = next.weekStartDate !== config.weekStartDate
    const numDaysChanged = (next.numDays ?? 7) !== (config.numDays ?? 7)
    if (weekChanged) {
      switchWeek(next)
    } else if (numDaysChanged) {
      const newLen = next.numDays ?? 7
      // Preserve sessions on days that still exist; only days beyond the new length are dropped
      const lost = plan.slice(newLen).reduce((n, d) => n + d.sessions.length, 0)
      if (lost > 0 && !window.confirm(`Shortening to ${newLen} days will remove ${lost} session${lost > 1 ? 's' : ''} on the dropped days. Continue?`)) {
        return
      }
      const merged = emptyPlan(next).map((d, i) => ({ ...d, sessions: plan[i]?.sessions ?? [] }))
      setHistory(h => [...h.slice(-9), plan])
      setConfig(next)
      setPlan(merged)
      setWarnings(validatePlan(merged, next))
    } else {
      setConfig(next)
    }
  }

  function navigateWeek(direction: -1 | 1) {
    switchWeek({ ...config, weekStartDate: addDays(config.weekStartDate, direction * 7) })
  }

  function copyWeekForward() {
    const newDate = addDays(config.weekStartDate, 7)
    const newConfig = { ...config, weekStartDate: newDate }
    const copied: DayPlan[] = plan.map((day, i) => ({
      ...day,
      date: addDays(newDate, i),
      sessions: day.sessions.map(s => ({
        ...s,
        id: Math.random().toString(36).slice(2, 9),
        locked: false,
        userEdited: true,
      })),
    }))
    setConfig(newConfig)
    setHistory([])
    setPlan(copied)
    setWarnings(validatePlan(copied, newConfig))
  }

  function handleSelectTemplate(templateConfig: PlanConfig) {
    setConfig(templateConfig)
    const next = emptyPlan(templateConfig)
    setPlan(next)
    setWarnings([])
    setHistory([])
    setShowTemplates(false)
    setShowWelcome(false)
  }

  // Express path — apply a template AND immediately fill the week
  function handleQuickPlan(templateConfig: PlanConfig) {
    const generated = generatePlan(templateConfig, emptyPlan(templateConfig))
    setConfig(templateConfig)
    setPlan(generated)
    setWarnings(validatePlan(generated, templateConfig))
    setHistory([])
    setShowTemplates(false)
    setShowWelcome(false)
    setJustGenerated(true)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <span className="text-2xl shrink-0">🗓️</span>
        <div className="hidden sm:block shrink-0">
          <h1 className="text-lg font-bold text-gray-900 leading-none">Training Planner</h1>
          <p className="text-xs text-gray-400 mt-0.5">Plan your week across all your sports</p>
        </div>
        <h1 className="text-lg font-bold text-gray-900 leading-none sm:hidden">Training Planner</h1>

        {/* Week navigation */}
        {tab === 'plan' && (
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <button
              onClick={() => navigateWeek(-1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 font-bold"
              title="Previous week"
            >←</button>
            <span className="text-xs text-gray-400 hidden md:inline font-medium">{config.weekStartDate}</span>
            <button
              onClick={() => navigateWeek(1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 font-bold"
              title="Next week"
            >→</button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setTab('plan')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'plan' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >Plan</button>
            <button
              onClick={() => setTab('calendar')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >Calendar</button>
          </div>
          {tab === 'plan' && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden px-3 py-1.5 text-sm bg-gray-100 rounded-lg text-gray-600 font-medium"
              title="Toggle setup panel"
            >{sidebarOpen ? '✕' : '⚙️'}</button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {tab === 'plan' && (
          <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block shrink-0`}>
            <SetupPanel
              config={config}
              onChange={handleConfigChange}
              onShowTemplates={() => setShowTemplates(true)}
            />
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 overflow-y-auto min-h-0">
          {tab === 'plan' ? (
            <WeeklyGrid
              plan={plan}
              warnings={warnings}
              config={config}
              onChange={applyPlan}
              onGenerate={handleGenerate}
              onRegenerate={() => applyPlan(generatePlan(config, plan))}
              onOpenAIWizard={() => setShowAIWizard(true)}
              onDesignSessions={handleDesignSessions}
              aiLoading={aiLoading}
              aiError={aiError}
              aiNotice={aiNotice}
              onDismissAiMessage={() => { setAiError(null); setAiNotice(null) }}
              justGenerated={justGenerated}
              onDismissNudge={() => setJustGenerated(false)}
              onUndo={undo}
              canUndo={history.length > 0}
              onCopyWeek={copyWeekForward}
              gcalEvents={gcal.gcalEvents}
            />
          ) : (
            <CalendarView plan={plan} config={config} onChange={applyPlan} gcal={gcal} />
          )}
        </main>
      </div>

      {showAIWizard && (
        <AIWizard
          config={config}
          onOptimise={handleAIOptimise}
          onClose={() => setShowAIWizard(false)}
        />
      )}

      {sessionDesigns && (
        <SessionDesigner
          designs={sessionDesigns}
          plan={plan}
          config={config}
          onApply={handleApplyDesigns}
          onClose={() => setSessionDesigns(null)}
        />
      )}

      {showWelcome && (
        <WelcomeModal
          weekStartDate={config.weekStartDate}
          onSelectTemplate={handleSelectTemplate}
          onQuickPlan={handleQuickPlan}
          onSkip={() => setShowWelcome(false)}
        />
      )}

      {showTemplates && (
        <TemplateSelector
          weekStartDate={config.weekStartDate}
          onSelect={handleSelectTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  )
}
