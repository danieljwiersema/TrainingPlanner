import type { SportDef, SportTarget } from '../lib/types'

interface Props {
  sport: SportDef
  target: SportTarget
  isFocus: boolean
  resolvedDefaultMin?: number  // computed from weekly goal when minutesPerWeek === 'default'
  onSetFocus: () => void
  onRemove: () => void
  onSetSessions: (n: number | 'auto') => void
  onSetMinutes: (val: number | 'default' | undefined) => void
}

function fmtMin(m: number): string {
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

export function SportTargetRow({ sport, target, isFocus, resolvedDefaultMin, onSetFocus, onRemove, onSetSessions, onSetMinutes }: Props) {
  const isAuto = target.sessionsPerWeek === 'auto'
  const sessions = isAuto ? 0 : (target.sessionsPerWeek as number) ?? 0
  const hasActivity = isAuto || sessions > 0
  const isDefault = target.minutesPerWeek === 'default'
  const explicitMin = typeof target.minutesPerWeek === 'number' ? target.minutesPerWeek : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={onSetFocus}
          className={`flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors text-left ${
            isFocus ? 'text-white border-transparent' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
          }`}
          style={isFocus ? { backgroundColor: sport.color, borderColor: sport.color } : {}}
          title="Set as focus sport — gets scheduling priority"
        >
          <span>{sport.icon}</span>
          <span>{sport.name}</span>
          {isFocus && <span className="ml-auto text-xs opacity-75 font-normal">focus</span>}
        </button>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-400 p-1 text-xs">✕</button>
      </div>

      <div className="pl-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-20">Sessions/wk</span>
          <div className="flex items-center gap-1.5">
            {isAuto ? (
              <>
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">auto</span>
                <button onClick={() => onSetSessions(3)} className="text-xs text-gray-400 hover:text-gray-600 underline leading-none">manual</button>
              </>
            ) : (
              <>
                <button onClick={() => onSetSessions(Math.max(0, (sessions as number) - 1))} className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold flex items-center justify-center">−</button>
                <span className="w-5 text-center text-sm font-semibold text-gray-800">{sessions}</span>
                <button onClick={() => onSetSessions((sessions as number) + 1)} className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold flex items-center justify-center">+</button>
                <button onClick={() => onSetSessions('auto')} className="text-xs text-gray-400 hover:text-blue-500 underline leading-none ml-1">auto</button>
              </>
            )}
          </div>
        </div>

        {hasActivity && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Min/week</span>
              <div className="flex items-center gap-1.5">
                {isDefault ? (
                  <>
                    <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                      {resolvedDefaultMin ? `~${fmtMin(resolvedDefaultMin)}` : 'default'}
                    </span>
                    <button onClick={() => onSetMinutes(resolvedDefaultMin ?? 60)} className="text-xs text-gray-400 hover:text-gray-600 underline leading-none">manual</button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-500 font-medium">
                      {!explicitMin ? 'auto' : fmtMin(explicitMin)}
                    </span>
                    <button onClick={() => onSetMinutes('default')} className="text-xs text-gray-400 hover:text-purple-500 underline leading-none">default</button>
                  </>
                )}
              </div>
            </div>
            {!isDefault && (
              <input
                type="range" min={0} max={600} step={15}
                value={explicitMin}
                onChange={e => onSetMinutes(e.target.value === '0' ? undefined : Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
