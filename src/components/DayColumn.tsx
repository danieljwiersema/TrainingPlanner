import { useDroppable } from '@dnd-kit/core'
import type { DayPlan, PlanWarning, SportDef, Session, PlanConfig } from '../lib/types'
import type { GCalEvent } from '../lib/googleAuth'
import { SessionBlock } from './SessionBlock'

interface Props {
  day: DayPlan
  dayIndex: number
  sports: SportDef[]
  config: PlanConfig
  warnings: PlanWarning[]
  gcalEvents: GCalEvent[]
  onAdd: () => void
  onSaveSession: (session: Session) => void
  onDelete: (sessionId: string) => void
  onTimeChange: (sessionId: string, time: string | undefined) => void
  onToggleLock: (sessionId: string) => void
  designMode?: boolean
  selectedSessionIds?: Set<string>
  onSelectSession?: (sessionId: string) => void
}

function fmtTime(iso: string): string {
  const t = iso.slice(11, 16)
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`
}

export function DayColumn({ day, dayIndex, sports, config, warnings, gcalEvents, onAdd, onSaveSession, onDelete, onTimeChange, onToggleLock, designMode, selectedSessionIds, onSelectSession }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIndex}` })

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="text-center mb-1">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{day.day}</p>
        <p className="text-xs text-gray-300">{day.date.slice(5)}</p>

        {(() => {
          const plannedMin = day.sessions.reduce((s, sess) => s + sess.durationMin, 0)
          const avail = day.availableMin
          const over = avail > 0 && plannedMin > avail
          const pct = avail > 0 ? Math.min(100, Math.round((plannedMin / avail) * 100)) : 0

          if (plannedMin === 0 && avail === 0) return null

          const label = plannedMin === 0
            ? <span className="text-gray-300">rest</span>
            : plannedMin < 60
              ? <span className={over ? 'text-amber-500' : 'text-gray-700'}>{plannedMin}m</span>
              : <span className={over ? 'text-amber-500' : 'text-gray-800 font-bold'}>
                  {Math.floor(plannedMin / 60)}h{plannedMin % 60 ? ` ${plannedMin % 60}m` : ''}
                </span>

          return (
            <div className="mt-1 space-y-1">
              <p className="text-sm leading-none">{label}</p>
              {avail > 0 && (
                <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${over ? 'bg-amber-400' : 'bg-blue-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {avail > 0 && (
                <p className="text-xs text-gray-300 leading-none">of {avail < 60 ? `${avail}m` : `${Math.floor(avail / 60)}h${avail % 60 ? ` ${avail % 60}m` : ''}`}</p>
              )}
            </div>
          )
        })()}
      </div>

      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 flex-1 min-h-24 rounded-xl transition-colors p-1 ${isOver ? 'bg-blue-50 ring-2 ring-blue-200' : ''}`}
      >
        {day.sessions.map(session => (
          <SessionBlock
            key={session.id}
            session={session}
            sport={sports.find(s => s.id === session.sportId)}
            config={config}
            dayIndex={dayIndex}
            warnings={warnings}
            onTimeChange={time => onTimeChange(session.id, time)}
            onSave={onSaveSession}
            onDelete={() => onDelete(session.id)}
            onToggleLock={() => onToggleLock(session.id)}
            designMode={designMode}
            isSelected={selectedSessionIds?.has(session.id)}
            onSelect={() => onSelectSession?.(session.id)}
          />
        ))}

        <button
          onClick={onAdd}
          className="border-2 border-dashed border-gray-200 rounded-xl h-12 flex items-center justify-center gap-1 text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-colors text-xs"
        >
          <span className="text-base leading-none">+</span> Add
        </button>

        {gcalEvents.length > 0 && (
          <div className="space-y-1 mt-1 pt-1 border-t border-gray-100">
            {gcalEvents.map(e => (
              <div key={e.id} className="text-xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1 flex items-center gap-1 min-w-0">
                <span className="shrink-0">📅</span>
                <span className="truncate">{e.allDay ? '' : fmtTime(e.start) + ' '}{e.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
