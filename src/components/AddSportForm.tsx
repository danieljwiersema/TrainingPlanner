import { useState } from 'react'

const ICON_OPTIONS = ['🏊','🚴','🏃','💪','⛷️','🧗','🥊','🏈','⚽','🎾','🏇','🛶','🤸','🏋️','🧘','🚣']
const COLOR_OPTIONS = ['#3b82f6','#22c55e','#eab308','#a855f7','#ef4444','#f97316','#06b6d4','#ec4899','#84cc16','#14b8a6']

interface Props {
  onAdd: (name: string, icon: string, color: string, kind: 'endurance' | 'strength') => void
  onCancel: () => void
}

export function AddSportForm({ onAdd, onCancel }: Props) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🏋️')
  const [color, setColor] = useState('#6b7280')
  const [kind, setKind] = useState<'endurance' | 'strength'>('endurance')

  function handleAdd() {
    if (!name.trim()) return
    onAdd(name.trim(), icon, color, kind)
  }

  return (
    <div className="space-y-2 p-3 bg-gray-50 rounded-xl">
      <input
        type="text"
        placeholder="Sport name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAdd()}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
        autoFocus
      />
      <div>
        <p className="text-xs text-gray-400 mb-1">Icon</p>
        <div className="flex flex-wrap gap-1">
          {ICON_OPTIONS.map(i => (
            <button key={i} onClick={() => setIcon(i)}
              className={`w-7 h-7 rounded text-sm flex items-center justify-center ${icon === i ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-200'}`}
            >{i}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Color</p>
        <div className="flex flex-wrap gap-1">
          {COLOR_OPTIONS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-gray-700 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-1">Type</p>
        <div className="flex gap-1">
          {(['endurance', 'strength'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors ${
                kind === k ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}
            >{k === 'strength' ? '💪 Strength' : '🏃 Cardio'}</button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">Sets the intensity language (HR zones vs load/RPE).</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-1.5 text-xs rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300">Cancel</button>
        <button onClick={handleAdd} className="flex-1 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">Add</button>
      </div>
    </div>
  )
}
