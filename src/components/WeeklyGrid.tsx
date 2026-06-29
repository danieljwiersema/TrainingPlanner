import { useState, useRef, useEffect } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import type { DayPlan, Session, PlanWarning, PlanConfig } from '../lib/types'
import type { GCalEvent } from '../lib/googleAuth'
import { DayColumn } from './DayColumn'
import { SessionEditor } from './SessionEditor'
import { exportICS } from '../lib/calendar'
import { usePlanEditor } from '../hooks/usePlanEditor'

interface EditTarget { dayIndex: number }

interface Props {
  plan: DayPlan[]
  warnings: PlanWarning[]
  config: PlanConfig
  onChange: (plan: DayPlan[]) => void
  onGenerate: () => void
  onRegenerate: () => void
  onOpenAIWizard: () => void
  onDesignSessions: (ids: string[], injuries?: string) => void
  aiLoading: boolean
  aiError: string | null
  aiNotice: string | null
  onDismissAiMessage: () => void
  justGenerated: boolean
  onDismissNudge: () => void
  onUndo: () => void
  canUndo: boolean
  onCopyWeek: () => void
  gcalEvents: GCalEvent[]
}

function formatMin(min: number): string {
  if (min === 0) return '0m'
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`
}

export function WeeklyGrid({ plan, warnings, config, onChange, onGenerate, onRegenerate, onOpenAIWizard, onDesignSessions, aiLoading, aiError, aiNotice, onDismissAiMessage, justGenerated, onDismissNudge, onUndo, canUndo, onCopyWeek, gcalEvents }: Props) {
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [designMode, setDesignMode] = useState(false)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [designInjuries, setDesignInjuries] = useState('')
  const [clearMenuOpen, setClearMenuOpen] = useState(false)
  const clearMenuRef = useRef<HTMLDivElement>(null)
  const { moveSession, saveSession, updateSession, deleteSession, setSessionTime, toggleLock, clearUnlocked, clearAll } = usePlanEditor(plan, onChange)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function toggleDesignMode() {
    setDesignMode(v => !v)
    setSelectedSessions(new Set())
  }

  function toggleSelectSession(id: string) {
    setSelectedSessions(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirmDesign() {
    if (selectedSessions.size === 0) return
    onDesignSessions([...selectedSessions], designInjuries.trim() || undefined)
    setDesignMode(false)
    setSelectedSessions(new Set())
    setDesignInjuries('')
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const { sessionId, fromDayIndex } = active.data.current as { sessionId: string; fromDayIndex: number }
    const overId = String(over.id)
    if (!overId.startsWith('day-')) return
    moveSession(sessionId, fromDayIndex, parseInt(overId.replace('day-', '')))
  }

  function handleSaveSession(dayIndex: number, session: Session) {
    saveSession(dayIndex, session)
    setEditing(null)
  }

  const [ignoredWarnings, setIgnoredWarnings] = useState<Set<string>>(new Set())
  const [warningsOpen, setWarningsOpen] = useState(false)
  const warningsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (warningsRef.current && !warningsRef.current.contains(e.target as Node)) setWarningsOpen(false)
      if (clearMenuRef.current && !clearMenuRef.current.contains(e.target as Node)) setClearMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const totalMin = plan.reduce((sum, d) => sum + d.sessions.reduce((s, sess) => s + sess.durationMin, 0), 0)
  const sessionCount = plan.reduce((sum, d) => sum + d.sessions.length, 0)
  const lockedCount = plan.reduce((sum, d) => sum + d.sessions.filter(s => s.locked).length, 0)

  function warningKey(w: PlanWarning) { return `${w.type}-${w.sportId}-${w.dayIndex}` }
  const activeWarnings = warnings.filter(w => !ignoredWarnings.has(warningKey(w)))

  // Guards
  const hasSessions = sessionCount > 0
  const hasTimeBudget = config.dailyMinutes.some(m => m > 0)
  const hasTargets = config.sports.some(s => {
    const t = config.targets[s.id]
    return t && (t.sessionsPerWeek === 'auto' || (typeof t.sessionsPerWeek === 'number' && t.sessionsPerWeek > 0))
  })
  const canGenerate = config.sports.length > 0 && hasTimeBudget && hasTargets
  const generateBlockedReason = config.sports.length === 0
    ? 'Add a sport in the setup panel first'
    : !hasTimeBudget
      ? 'Set some daily time in the setup panel first'
      : !hasTargets
        ? 'Set at least one sport to 1+ sessions/week'
        : ''

  function handleClearAll() {
    setClearMenuOpen(false)
    if (window.confirm('Clear all sessions for this week? You can undo this with ⌘Z.')) clearAll()
  }

  // Per-sport volume
  const sportVolumes: Record<string, number> = {}
  for (const sport of config.sports) {
    sportVolumes[sport.id] = plan.reduce((sum, d) =>
      sum + d.sessions.filter(s => s.sportId === sport.id).reduce((s, sess) => s + sess.durationMin, 0), 0
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Generate buttons — top of screen */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          title={canGenerate ? 'Build a schedule from your time budget and targets' : generateBlockedReason}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-colors"
        >Generate Schedule</button>
        <button
          onClick={onOpenAIWizard}
          disabled={aiLoading || !hasSessions}
          title={hasSessions ? 'Assign intensity zones with AI' : 'Generate a schedule first'}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-200 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-colors flex items-center gap-2"
        >
          {aiLoading
            ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Optimising…</>
            : '✨ Optimise Intensity Distribution'}
        </button>
        <button
          onClick={toggleDesignMode}
          disabled={aiLoading || (!hasSessions && !designMode)}
          title={hasSessions ? 'Pick sessions for AI to design workout options' : 'Generate a schedule first'}
          className={`px-4 py-2 font-bold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            designMode
              ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
              : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-2 border-purple-200'
          }`}
        >🎯 Design Sessions</button>
        {sessionCount > 0 && (
          <button
            onClick={onRegenerate}
            title="Keep locked sessions, regenerate everything else"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
          >🔄 Regenerate</button>
        )}
      </div>

      {!canGenerate && !hasSessions && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ {generateBlockedReason} before generating a schedule.</p>
      )}

      {(aiError || aiNotice) && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border ${aiError ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <span className="text-sm shrink-0">{aiError ? '⚠️' : '✅'}</span>
          <span className={`text-sm flex-1 leading-snug ${aiError ? 'text-red-700' : 'text-green-700'}`}>{aiError ?? aiNotice}</span>
          <button onClick={onDismissAiMessage} className={`text-sm leading-none shrink-0 ${aiError ? 'text-red-300 hover:text-red-500' : 'text-green-300 hover:text-green-500'}`}>✕</button>
        </div>
      )}

      {justGenerated && !designMode && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-xl">
          <span className="text-sm text-purple-700">
            ✅ Schedule generated — now use <span className="font-semibold">✨ Optimise Intensity</span> to assign hard/easy zones to your goals.
          </span>
          <button onClick={onDismissNudge} className="ml-auto text-purple-300 hover:text-purple-500 text-sm leading-none shrink-0">✕</button>
        </div>
      )}

      {designMode && (
        <div className="px-4 py-3 bg-purple-50 border-2 border-purple-200 rounded-xl space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-purple-700">
              {selectedSessions.size === 0
                ? 'Click sessions to select them for AI design'
                : `${selectedSessions.size} session${selectedSessions.size > 1 ? 's' : ''} selected`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={toggleDesignMode} className="text-xs text-purple-400 hover:text-purple-600 font-medium">Cancel</button>
              {selectedSessions.size > 0 && (
                <button
                  onClick={confirmDesign}
                  disabled={aiLoading}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {aiLoading
                    ? <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Designing…</>
                    : `Design ${selectedSessions.size} session${selectedSessions.size > 1 ? 's' : ''} →`}
                </button>
              )}
            </div>
          </div>
          {selectedSessions.size > 0 && (
            <input
              type="text"
              value={designInjuries}
              onChange={e => setDesignInjuries(e.target.value)}
              placeholder="Any injuries to work around? (optional) e.g. sore knee — avoid hard running"
              className="w-full px-3 py-1.5 text-xs border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-700 placeholder-gray-300"
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {sessionCount > 0 && (
          <>
            <span className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{sessionCount}</span> sessions
            </span>
            <span className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{formatMin(totalMin)}</span> total
            </span>
            {lockedCount > 0 && (
              <span className="text-sm text-blue-600 font-medium">🔒 {lockedCount} locked</span>
            )}
            {/* Per-sport volumes */}
            <span className="text-gray-200 hidden sm:inline">|</span>
            {config.sports.filter(s => (sportVolumes[s.id] ?? 0) > 0).map(s => (
              <span key={s.id} className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
                <span>{s.icon}</span>
                <span className="font-semibold text-gray-700">{formatMin(sportVolumes[s.id])}</span>
              </span>
            ))}
          </>
        )}
        {activeWarnings.length > 0 && (
          <div className="relative" ref={warningsRef}>
            <button
              onClick={() => setWarningsOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
            >
              ⚠️ {activeWarnings.length} warning{activeWarnings.length > 1 ? 's' : ''} {warningsOpen ? '▲' : '▼'}
            </button>
            {warningsOpen && (
              <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-72 max-w-sm">
                <div className="p-2 space-y-1">
                  {activeWarnings.map(w => (
                    <div key={warningKey(w)} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group">
                      <span className="text-xs mt-0.5 shrink-0">{w.type === 'target-not-met' ? 'ℹ️' : '⚠️'}</span>
                      <span className="text-xs text-gray-600 flex-1 leading-snug">{w.message}</span>
                      <button
                        onClick={() => setIgnoredWarnings(s => new Set([...s, warningKey(w)]))}
                        className="text-xs text-gray-300 hover:text-gray-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Ignore this warning"
                      >✕</button>
                    </div>
                  ))}
                </div>
                {ignoredWarnings.size > 0 && (
                  <div className="border-t border-gray-100 px-3 py-1.5">
                    <button
                      onClick={() => setIgnoredWarnings(new Set())}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >Show {ignoredWarnings.size} ignored</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canUndo && (
            <button
              onClick={onUndo}
              title="Undo last change (⌘Z)"
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold"
            >↩ Undo</button>
          )}
          {sessionCount > 0 && (
            <>
              <button
                onClick={onCopyWeek}
                title="Copy all sessions to next week"
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold"
              >Copy →</button>
              <div className="relative" ref={clearMenuRef}>
                <button
                  onClick={() => setClearMenuOpen(v => !v)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold"
                >Clear ▾</button>
                {clearMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10 min-w-36">
                    {lockedCount > 0 && (
                      <button
                        onClick={() => { setClearMenuOpen(false); clearUnlocked() }}
                        className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >Clear unlocked only</button>
                    )}
                    <button
                      onClick={handleClearAll}
                      className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50"
                    >Clear all sessions</button>
                  </div>
                )}
              </div>
              <button
                onClick={() => exportICS(plan, config)}
                title="Download .ics file to import into any calendar app"
                className="text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center gap-1.5"
              >📅 Export</button>
            </>
          )}
        </div>
      </div>

      {sessionCount === 0 && (
        <div className="flex flex-col items-center justify-center text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-2xl">
          <span className="text-4xl mb-3">🗓️</span>
          <p className="text-base font-semibold text-gray-700">No sessions yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-5 max-w-xs">Build a week from your time budget and sport targets, then fine-tune the intensity with AI.</p>
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            title={canGenerate ? '' : generateBlockedReason}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-colors"
          >Generate Schedule</button>
          <p className="text-xs text-gray-300 mt-3">{canGenerate ? 'or add sessions manually using the + buttons below' : generateBlockedReason}</p>
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="grid gap-3 flex-1 min-h-0 min-w-[500px]" style={{ gridTemplateColumns: `repeat(${plan.length}, minmax(0, 1fr))` }}>
            {plan.map((day, i) => (
              <DayColumn
                key={day.day}
                day={day}
                dayIndex={i}
                sports={config.sports}
                config={config}
                warnings={warnings}
                gcalEvents={gcalEvents.filter(e => (e.start ?? '').startsWith(day.date))}
                onAdd={() => setEditing({ dayIndex: i })}
                onSaveSession={updateSession}
                onDelete={deleteSession}
                onTimeChange={setSessionTime}
                onToggleLock={toggleLock}
                designMode={designMode}
                selectedSessionIds={selectedSessions}
                onSelectSession={toggleSelectSession}
              />
            ))}
          </div>
        </div>
      </DndContext>

      {editing && (
        <SessionEditor
          session={null}
          dayName={plan[editing.dayIndex].day}
          config={config}
          onSave={s => handleSaveSession(editing.dayIndex, s)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
