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
  aiLoading: boolean
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

export function WeeklyGrid({ plan, warnings, config, onChange, onGenerate, onRegenerate, onOpenAIWizard, aiLoading, onUndo, canUndo, onCopyWeek, gcalEvents }: Props) {
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const { moveSession, saveSession, updateSession, deleteSession, setSessionTime, toggleLock, clearUnlocked, clearAll } = usePlanEditor(plan, onChange)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const totalMin = plan.reduce((sum, d) => sum + d.sessions.reduce((s, sess) => s + sess.durationMin, 0), 0)
  const sessionCount = plan.reduce((sum, d) => sum + d.sessions.length, 0)
  const lockedCount = plan.reduce((sum, d) => sum + d.sessions.filter(s => s.locked).length, 0)

  function warningKey(w: PlanWarning) { return `${w.type}-${w.sportId}-${w.dayIndex}` }
  const activeWarnings = warnings.filter(w => !ignoredWarnings.has(warningKey(w)))

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
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors"
        >Generate Plan</button>
        <button
          onClick={onOpenAIWizard}
          disabled={aiLoading}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold rounded-xl text-sm transition-colors flex items-center gap-2"
        >
          {aiLoading
            ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating…</>
            : '✨ AI Generate'}
        </button>
        {sessionCount > 0 && (
          <button
            onClick={onRegenerate}
            title="Keep locked sessions, regenerate everything else"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
          >🔄 Regenerate</button>
        )}
      </div>

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
              <div className="relative group">
                <button className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold">
                  Clear ▾
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden hidden group-hover:block z-10 min-w-36">
                  {lockedCount > 0 && (
                    <button
                      onClick={clearUnlocked}
                      className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >Clear unlocked only</button>
                  )}
                  <button
                    onClick={clearAll}
                    className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50"
                  >Clear all sessions</button>
                </div>
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
