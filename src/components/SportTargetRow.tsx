import type { SportDef, SportTarget, WeekIntensity } from '../lib/types'

const INTENSITIES: WeekIntensity[] = ['light', 'moderate', 'hard', 'peak']

const INTENSITY_SHORT: Record<WeekIntensity, string> = {
  light: 'L', moderate: 'M', hard: 'H', peak: 'P',
}

const INTENSITY_ACTIVE: Record<WeekIntensity, string> = {
  light:    'bg-green-100 text-green-800',
  moderate: 'bg-yellow-100 text-yellow-800',
  hard:     'bg-orange-100 text-orange-800',
  peak:     'bg-red-100 text-red-800',
}

interface Props {
  sport: SportDef
  target: SportTarget
  isFocus: boolean
  onSetFocus: () => void
  onRemove: () => void
  onSetSessions: (n: number | 'auto') => void
  onSetMinutes: (raw: string) => void
  onSetIntensity: (intensity: WeekIntensity | undefined) => void
}

export function SportTargetRow({ sport, target, isFocus, onSetFocus, onRemove, onSetSessions, onSetMinutes, onSetIntensity }: Props) {
  const isAuto = target.sessionsPerWeek === 'auto'
  const sessions = isAuto ? 0 : (target.sessionsPerWeek as number) ?? 0
  const hasActivity = isAuto || sessions > 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={onSetFocus}
          className={`flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors text-left ${
            isFocus ? 'text-white border-transparent' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
          }`}
          style={isFocus ? { backgroundColor: sport.color, borderColor: sport.color } : {}}
          title="Set as focus sport — gets harder zone assignments and scheduling priority"
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
                <button
                  onClick={() => onSetSessions(3)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline leading-none"
                >manual</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onSetSessions((sessions as number) - 1)}
                  className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold flex items-center justify-center"
                >−</button>
                <span className="w-5 text-center text-sm font-semibold text-gray-800">{sessions}</span>
                <button
                  onClick={() => onSetSessions((sessions as number) + 1)}
                  className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold flex items-center justify-center"
                >+</button>
                <button
                  onClick={() => onSetSessions('auto')}
                  className="text-xs text-gray-400 hover:text-blue-500 underline leading-none ml-1"
                >auto</button>
              </>
            )}
          </div>
        </div>

        {hasActivity && (
          <>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Min/week</span>
                <span className="text-xs text-gray-500 font-medium">
                  {!target.minutesPerWeek
                    ? 'auto'
                    : target.minutesPerWeek < 60
                      ? `${target.minutesPerWeek}m`
                      : `${Math.floor(target.minutesPerWeek / 60)}h${target.minutesPerWeek % 60 ? ` ${target.minutesPerWeek % 60}m` : ''}`}
                </span>
              </div>
              <input
                type="range" min={0} max={600} step={15}
                value={target.minutesPerWeek ?? 0}
                onChange={e => onSetMinutes(e.target.value === '0' ? '' : e.target.value)}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 w-20 shrink-0">Intensity</span>
              <div className="flex gap-0.5">
                <button
                  onClick={() => onSetIntensity(undefined)}
                  title="Use global default intensity"
                  className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    !target.intensity ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >def</button>
                {INTENSITIES.map(w => (
                  <button
                    key={w}
                    onClick={() => onSetIntensity(w === target.intensity ? undefined : w)}
                    title={w}
                    className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                      target.intensity === w ? INTENSITY_ACTIVE[w] : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >{INTENSITY_SHORT[w]}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
