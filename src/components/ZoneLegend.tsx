import { useState, useRef, useEffect } from 'react'
import type { Zone } from '../lib/types'
import { zoneLegend } from '../lib/zoneInfo'

const ZONE_DOT: Record<Zone, string> = {
  recovery:   'bg-gray-300',
  easy:       'bg-green-400',
  moderate:   'bg-yellow-400',
  hard:       'bg-orange-400',
  'flat out': 'bg-red-400',
}

interface Props {
  hasStrength: boolean
}

export function ZoneLegend({ hasStrength }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-medium"
        title="What do the intensity zones mean?"
      >ⓘ Zones</button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-3 w-72 space-y-3">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Cardio / Endurance</p>
            <div className="space-y-1.5">
              {zoneLegend('endurance').map(z => (
                <div key={z.zone} className="flex items-start gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${ZONE_DOT[z.zone]}`} />
                  <p className="text-xs text-gray-600 leading-snug"><span className="font-semibold text-gray-800">{z.short}</span> — {z.desc}</p>
                </div>
              ))}
            </div>
          </div>
          {hasStrength && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Strength</p>
              <div className="space-y-1.5">
                {zoneLegend('strength').map(z => (
                  <div key={z.zone} className="flex items-start gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${ZONE_DOT[z.zone]}`} />
                    <p className="text-xs text-gray-600 leading-snug"><span className="font-semibold text-gray-800">{z.short}</span> — {z.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
