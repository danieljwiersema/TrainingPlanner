import type { PlanConfig } from '../lib/types'
import { TEMPLATES } from '../lib/templates'

interface Props {
  weekStartDate: string
  onSelect: (config: PlanConfig) => void
  onClose: () => void
}

export function TemplateSelector({ weekStartDate, onSelect, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h2 className="font-bold text-gray-800 text-lg">Start from a template</h2>
          <p className="text-sm text-gray-400 mt-0.5">Choose a preset or close to set up manually</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect({ ...t.config, weekStartDate })}
              className="p-4 rounded-xl border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50 text-left transition-colors space-y-1"
            >
              <span className="text-2xl block">{t.icon}</span>
              <p className="font-semibold text-gray-800 text-sm">{t.name}</p>
              <p className="text-xs text-gray-400 leading-snug">{t.description}</p>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Skip — set up manually
        </button>
      </div>
    </div>
  )
}
