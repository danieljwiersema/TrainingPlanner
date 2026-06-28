import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Session, PlanWarning, SportDef } from '../lib/types'

const ZONE_BADGE: Record<string, string> = {
  recovery:   'bg-gray-100 text-gray-700',
  easy:       'bg-green-100 text-green-800',
  moderate:   'bg-yellow-100 text-yellow-800',
  hard:       'bg-orange-100 text-orange-800',
  'flat out': 'bg-red-100 text-red-800',
}

interface Props {
  session: Session
  sport: SportDef | undefined
  dayIndex: number
  isoDate: string
  warnings: PlanWarning[]
  onTimeChange: (time: string | undefined) => void
  onEdit: () => void
  onDelete: () => void
  onToggleLock: () => void
}

export function SessionBlock({ session, sport, dayIndex, warnings, onTimeChange, onEdit, onDelete, onToggleLock }: Props) {
  const timeInputRef = useRef<HTMLInputElement>(null)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: session.id,
    data: { sessionId: session.id, fromDayIndex: dayIndex },
    disabled: !!session.locked,
  })

  const hasViolation = warnings.some(w =>
    (w.dayIndex === dayIndex || w.dayIndex === -1) && w.sportId === session.sportId && w.type !== 'target-not-met'
  )

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl overflow-hidden shadow-sm border-2 ${
        session.locked ? 'border-blue-400' : hasViolation ? 'border-amber-400' : 'border-transparent'
      } select-none`}
    >
      <div
        {...(!session.locked ? attributes : {})}
        {...(!session.locked ? listeners : {})}
        className={`px-3 py-2 flex items-center gap-2 ${session.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ backgroundColor: sport?.color ?? '#6b7280' }}
      >
        <span className="text-base">{sport?.icon ?? '🏋️'}</span>
        <span className="text-white font-semibold text-sm">{sport?.name ?? session.sportId}</span>
        <div className="ml-auto flex items-center gap-1">
          {hasViolation && !session.locked && <span className="text-amber-300 text-xs">⚠️</span>}
          {session.userEdited && !session.locked && <span className="text-white/50 text-xs">✏️</span>}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onToggleLock() }}
            title={session.locked ? 'Unlock session' : 'Lock session in place'}
            className={`text-sm leading-none transition-opacity ${session.locked ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
          >
            {session.locked ? '🔒' : '🔓'}
          </button>
        </div>
      </div>

      <div className="bg-white px-3 py-2">
        <p className="text-sm font-medium text-gray-800 leading-tight">{session.label}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ZONE_BADGE[session.zone]}`}>
            {session.zone}
          </span>
          <span className="text-xs text-gray-500">{session.durationMin} min</span>
          {session.locked && <span className="text-xs text-blue-500 font-medium">locked</span>}
        </div>
        {session.notes && (
          <p className="text-xs text-gray-400 mt-1.5 leading-snug line-clamp-2">{session.notes}</p>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-xs text-gray-400">🕐</span>
          <input
            ref={timeInputRef}
            type="time"
            value={session.startTime ?? ''}
            onChange={e => onTimeChange(e.target.value || undefined)}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            className="text-xs text-gray-600 border border-gray-200 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-300 w-24 cursor-pointer"
          />
          {session.startTime && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onTimeChange(undefined) }}
              className="text-gray-300 hover:text-gray-500 text-xs leading-none"
              title="Clear time"
            >✕</button>
          )}
        </div>
      </div>

      <div className="bg-gray-50 px-3 py-1.5 flex gap-2 border-t border-gray-100">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >Edit</button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="text-xs text-red-400 hover:text-red-600 font-medium ml-auto"
        >✕</button>
      </div>
    </div>
  )
}
