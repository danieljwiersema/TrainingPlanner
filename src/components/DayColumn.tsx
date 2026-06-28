import { useDroppable } from '@dnd-kit/core'
import type { DayPlan, PlanWarning, SportDef } from '../lib/types'
import { SessionBlock } from './SessionBlock'

interface Props {
  day: DayPlan
  dayIndex: number
  sports: SportDef[]
  warnings: PlanWarning[]
  onAdd: () => void
  onEdit: (sessionId: string) => void
  onDelete: (sessionId: string) => void
  onTimeChange: (sessionId: string, time: string | undefined) => void
  onToggleLock: (sessionId: string) => void
}

export function DayColumn({ day, dayIndex, sports, warnings, onAdd, onEdit, onDelete, onTimeChange, onToggleLock }: Props) {
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
            dayIndex={dayIndex}
            isoDate={day.date}
            warnings={warnings}
            onTimeChange={time => onTimeChange(session.id, time)}
            onEdit={() => onEdit(session.id)}
            onDelete={() => onDelete(session.id)}
            onToggleLock={() => onToggleLock(session.id)}
          />
        ))}

        <button
          onClick={onAdd}
          className="border-2 border-dashed border-gray-200 rounded-xl h-12 flex items-center justify-center gap-1 text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-colors text-xs"
        >
          <span className="text-base leading-none">+</span> Add
        </button>
      </div>
    </div>
  )
}
