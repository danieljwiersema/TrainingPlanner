import { useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import type { DayPlan, Session, PlanWarning, PlanConfig } from '../lib/types'
import type { GCalEvent } from '../lib/googleAuth'
import { DayColumn } from './DayColumn'
import { SessionEditor } from './SessionEditor'
import { exportICS } from '../lib/calendar'
import { usePlanEditor } from '../hooks/usePlanEditor'

interface EditTarget { dayIndex: number; sessionId?: string }

interface Props {
  plan: DayPlan[]
  warnings: PlanWarning[]
  config: PlanConfig
  onChange: (plan: DayPlan[]) => void
  onRegenerate: () => void
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

export function WeeklyGrid({ plan, warnings, config, onChange, onRegenerate, onUndo, canUndo, onCopyWeek, gcalEvents }: Props) {
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const { moveSession, saveSession, deleteSession, setSessionTime, toggleLock, clearUnlocked, clearAll } = usePlanEditor(plan, onChange)
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

  const totalMin = plan.reduce((sum, d) => sum + d.sessions.reduce((s, sess) => s + sess.durationMin, 0), 0)
  const sessionCount = plan.reduce((sum, d) => sum + d.sessions.length, 0)
  const lockedCount = plan.reduce((sum, d) => sum + d.sessions.filter(s => s.locked).length, 0)
  const hardWarnings = warnings.filter(w => w.type === 'back-to-back-hard' || w.type === 'same-sport-consecutive')
  const targetWarnings = warnings.filter(w => w.type === 'target-not-met')
  const editingDay = editing ? plan[editing.dayIndex] : null
  const editingSession = editing?.sessionId ? editingDay?.sessions.find(s => s.id === editing.sessionId) ?? null : null

  // Per-sport volume
  const sportVolumes: Record<string, number> = {}
  for (const sport of config.sports) {
    sportVolumes[sport.id] = plan.reduce((sum, d) =>
      sum + d.sessions.filter(s => s.sportId === sport.id).reduce((s, sess) => s + sess.durationMin, 0), 0
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
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
        {hardWarnings.length > 0 && (
          <span className="text-sm text-amber-600 font-medium">⚠️ {hardWarnings.length} scheduling warning{hardWarnings.length > 1 ? 's' : ''}</span>
        )}
        {targetWarnings.length > 0 && (
          <span className="text-sm text-blue-500 font-medium">ℹ️ {targetWarnings.length} target{targetWarnings.length > 1 ? 's' : ''} not fully met</span>
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
                onClick={onRegenerate}
                title="Keep locked sessions, regenerate everything else"
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5"
              >🔄 Regenerate</button>
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

      {warnings.length > 0 && (
        <div className="space-y-1">
          {hardWarnings.map((w, i) => (
            <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ {w.message}
            </div>
          ))}
          {targetWarnings.map((w, i) => (
            <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
              ℹ️ {w.message}
            </div>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="grid grid-cols-7 gap-3 flex-1 min-h-0 min-w-[700px]">
            {plan.map((day, i) => (
              <DayColumn
                key={day.day}
                day={day}
                dayIndex={i}
                sports={config.sports}
                warnings={warnings}
                gcalEvents={gcalEvents.filter(e => (e.start ?? '').startsWith(day.date))}
                onAdd={() => setEditing({ dayIndex: i })}
                onEdit={sessionId => setEditing({ dayIndex: i, sessionId })}
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
          session={editingSession}
          dayName={plan[editing.dayIndex].day}
          config={config}
          onSave={s => handleSaveSession(editing.dayIndex, s)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
