import { useState } from 'react'
import type { Session, Zone, PlanConfig } from '../lib/types'
import { getLabel } from '../lib/labelUtils'

const ZONES: Zone[] = ['recovery', 'easy', 'moderate', 'hard', 'flat out']

const ZONE_COLORS: Record<Zone, string> = {
  recovery:   'bg-gray-100 text-gray-700 border-gray-300',
  easy:       'bg-green-50 text-green-800 border-green-300',
  moderate:   'bg-yellow-50 text-yellow-800 border-yellow-300',
  hard:       'bg-orange-50 text-orange-800 border-orange-300',
  'flat out': 'bg-red-50 text-red-800 border-red-300',
}

const ZONE_DESC: Record<Zone, string> = {
  recovery:   'Very easy. Can chat without effort.',
  easy:       'Comfortable. Can hold a full conversation.',
  moderate:   'Steady. Can speak in short sentences.',
  hard:       'Uncomfortable. Can only say a few words.',
  'flat out': 'Maximum effort. Speaking is impossible.',
}

interface Props {
  session: Session | null
  dayName: string
  config: PlanConfig
  onSave: (session: Session) => void
  onClose: () => void
}

export function SessionEditor({ session, dayName, config, onSave, onClose }: Props) {
  const [sportId, setSportId] = useState(session?.sportId ?? config.sports[0]?.id ?? '')
  const [zone, setZone] = useState<Zone>(session?.zone ?? 'easy')
  const [duration, setDuration] = useState(session?.durationMin ?? 45)
  const [notes, setNotes] = useState(session?.notes ?? '')

  function handleSave() {
    const sport = config.sports.find(s => s.id === sportId)
    onSave({
      id: session?.id ?? Math.random().toString(36).slice(2, 9),
      sportId,
      zone,
      durationMin: duration,
      startTime: session?.startTime,
      label: sport ? getLabel(sport, zone) : zone,
      notes: notes.trim() || undefined,
      userEdited: true,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-gray-800 text-lg">{session ? 'Edit' : 'Add'} Session — {dayName}</h2>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sport</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {config.sports.map(s => (
              <button
                key={s.id}
                onClick={() => setSportId(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                  sportId === s.id ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100'
                }`}
                style={sportId === s.id ? { backgroundColor: s.color, borderColor: s.color } : {}}
              >
                <span>{s.icon}</span><span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Zone</label>
          <div className="flex flex-col gap-1.5 mt-1">
            {ZONES.map(z => (
              <button
                key={z}
                onClick={() => setZone(z)}
                className={`py-1.5 px-3 rounded-lg text-sm capitalize font-medium border transition-colors text-left ${
                  zone === z ? ZONE_COLORS[z] + ' border-2' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <span>{z}</span>
                <span className="text-xs font-normal text-gray-400 ml-2">{ZONE_DESC[z]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Duration — {duration} min
          </label>
          <input
            type="range" min={15} max={300} step={5} value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            className="w-full mt-1 accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>15m</span><span>5h</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. 6×400m @ 5k pace, 90s rest · fasted · track session"
            rows={3}
            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-700 placeholder-gray-300"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 font-medium text-sm hover:bg-gray-200">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  )
}
