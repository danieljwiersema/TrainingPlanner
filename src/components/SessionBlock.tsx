import { useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Session, PlanWarning, SportDef, Zone, PlanConfig } from '../lib/types'
import { getLabel } from '../lib/labelUtils'

const ZONES: Zone[] = ['recovery', 'easy', 'moderate', 'hard', 'flat out']

const ZONE_BADGE: Record<string, string> = {
  recovery:   'bg-gray-100 text-gray-700',
  easy:       'bg-green-100 text-green-800',
  moderate:   'bg-yellow-100 text-yellow-800',
  hard:       'bg-orange-100 text-orange-800',
  'flat out': 'bg-red-100 text-red-800',
}

const ZONE_ACTIVE: Record<string, string> = {
  recovery:   'bg-gray-200 text-gray-800 border-gray-400',
  easy:       'bg-green-100 text-green-900 border-green-400',
  moderate:   'bg-yellow-100 text-yellow-900 border-yellow-400',
  hard:       'bg-orange-100 text-orange-900 border-orange-400',
  'flat out': 'bg-red-100 text-red-900 border-red-400',
}

interface Props {
  session: Session
  sport: SportDef | undefined
  config: PlanConfig
  dayIndex: number
  warnings: PlanWarning[]
  onTimeChange: (time: string | undefined) => void
  onSave: (session: Session) => void
  onDelete: () => void
  onToggleLock: () => void
  designMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
}

export function SessionBlock({ session, sport, config, dayIndex, warnings, onTimeChange, onSave, onDelete, onToggleLock, designMode, isSelected, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [zone, setZone] = useState<Zone>(session.zone)
  const [duration, setDuration] = useState(session.durationMin)
  const [notes, setNotes] = useState(session.notes ?? '')
  const [sportId, setSportId] = useState(session.sportId)

  useEffect(() => {
    if (!expanded) {
      setZone(session.zone)
      setDuration(session.durationMin)
      setNotes(session.notes ?? '')
      setSportId(session.sportId)
    }
  }, [session, expanded])

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: session.id,
    data: { sessionId: session.id, fromDayIndex: dayIndex },
    disabled: !!session.locked || expanded || !!designMode,
  })

  const hasViolation = warnings.some(w =>
    (w.dayIndex === dayIndex || w.dayIndex === -1) && w.sportId === session.sportId && w.type !== 'target-not-met'
  )

  const activeSport = config.sports.find(s => s.id === sportId) ?? sport

  function commit(z: Zone, dur: number, n: string, sid: string) {
    const sp = config.sports.find(s => s.id === sid)
    onSave({
      ...session,
      sportId: sid,
      zone: z,
      durationMin: dur,
      notes: n.trim() || undefined,
      label: sp ? getLabel(sp, z) : z,
      userEdited: true,
    })
  }

  function handleExpand(e: React.MouseEvent) {
    e.stopPropagation()
    if (designMode) { onSelect?.(); return }
    if (session.locked) return
    if (expanded) {
      commit(zone, duration, notes, sportId)
      setExpanded(false)
    } else {
      setExpanded(true)
    }
  }

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  const displayLabel = activeSport ? getLabel(activeSport, zone) : zone
  const fmtDur = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl overflow-hidden shadow-sm border-2 transition-all ${
        designMode && isSelected ? 'border-purple-500 ring-2 ring-purple-300' :
        designMode ? 'border-purple-200 cursor-pointer hover:border-purple-400' :
        session.locked ? 'border-blue-400' : hasViolation ? 'border-amber-400' : 'border-transparent'
      } select-none`}
    >
      {/* Header — drag handle */}
      <div
        {...(!session.locked && !expanded ? attributes : {})}
        {...(!session.locked && !expanded ? listeners : {})}
        className={`px-3 py-2 flex items-center gap-2 ${session.locked || expanded ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ backgroundColor: activeSport?.color ?? '#6b7280' }}
      >
        <span className="text-base">{activeSport?.icon ?? '🏋️'}</span>
        <span className="text-white font-semibold text-sm">{activeSport?.name ?? sportId}</span>
        <div className="ml-auto flex items-center gap-1">
          {designMode && (
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${isSelected ? 'bg-white border-white text-purple-600' : 'border-white/60 text-white/60'}`}>
              {isSelected ? '✓' : ''}
            </span>
          )}
          {hasViolation && !session.locked && !designMode && <span className="text-amber-300 text-xs">⚠️</span>}
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

      {/* Body — click to expand/collapse */}
      <div
        onClick={handleExpand}
        className={`bg-white px-3 py-2 transition-colors ${!session.locked ? 'cursor-pointer hover:bg-gray-50' : ''} ${expanded ? 'bg-gray-50' : ''}`}
      >
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-medium text-gray-800 leading-tight flex-1">{displayLabel}</p>
          {!session.locked && (
            <span className="text-gray-300 text-xs mt-0.5 shrink-0">{expanded ? '▲' : '▼'}</span>
          )}
        </div>

        {!expanded && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ZONE_BADGE[zone]}`}>{zone}</span>
            <span className="text-xs text-gray-500">{fmtDur(duration)}</span>
            {session.locked && <span className="text-xs text-blue-500 font-medium">locked</span>}
            {notes && <span className="text-xs text-gray-400 truncate max-w-[120px]">{notes}</span>}
          </div>
        )}

        {expanded && (
          <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>

            {/* Sport selector */}
            {config.sports.length > 1 && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Sport</p>
                <div className="flex flex-wrap gap-1">
                  {config.sports.map(s => (
                    <button
                      key={s.id}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); setSportId(s.id) }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border-2 transition-colors ${
                        sportId === s.id ? 'text-white border-transparent' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                      style={sportId === s.id ? { backgroundColor: s.color, borderColor: s.color } : {}}
                    >
                      <span>{s.icon}</span><span>{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Zone selector */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Zone</p>
              <div className="flex flex-wrap gap-1">
                {ZONES.map(z => (
                  <button
                    key={z}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); setZone(z) }}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize border transition-colors ${
                      zone === z ? ZONE_ACTIVE[z] + ' border-2' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`}
                  >{z}</button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-400">Duration</p>
                <span className="text-xs font-semibold text-gray-700">{fmtDur(duration)}</span>
              </div>
              <input
                type="range" min={15} max={300} step={5}
                value={duration}
                onPointerDown={e => e.stopPropagation()}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            {/* Time */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">⏰</span>
              <input
                type="time"
                value={session.startTime ?? ''}
                onChange={e => onTimeChange(e.target.value || undefined)}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                className="text-xs text-gray-600 border border-gray-200 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-300 w-24"
              />
              {session.startTime && (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onTimeChange(undefined) }}
                  className="text-gray-300 hover:text-gray-500 text-xs"
                >✕</button>
              )}
            </div>

            {/* Notes */}
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              placeholder="e.g. 6×400m @ 5k pace, 90s rest"
              rows={2}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-600 placeholder-gray-300"
            />

            {/* Done button */}
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); commit(zone, duration, notes, sportId); setExpanded(false) }}
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >Done</button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {!expanded && (
        <div className="bg-gray-50 px-3 py-1.5 flex items-center gap-1.5 border-t border-gray-100">
          <span className="text-xs text-gray-400">⏰</span>
          <input
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
              className="text-gray-300 hover:text-gray-500 text-xs"
            >✕</button>
          )}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-xs text-red-400 hover:text-red-600 font-medium ml-auto"
          >✕</button>
        </div>
      )}

      {expanded && (
        <div className="bg-gray-50 px-3 py-1.5 flex border-t border-gray-100">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-xs text-red-400 hover:text-red-600 font-medium ml-auto"
          >Delete session</button>
        </div>
      )}
    </div>
  )
}
