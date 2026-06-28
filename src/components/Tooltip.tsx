import { type ReactNode } from 'react'

interface Props {
  text: string
  children: ReactNode
}

export function Tooltip({ text, children }: Props) {
  return (
    <span className="relative group inline-flex items-center">
      {children}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-48 text-center leading-snug shadow-lg">
        {text}
      </span>
    </span>
  )
}

export function InfoIcon({ tooltip }: { tooltip: string }) {
  return (
    <Tooltip text={tooltip}>
      <span className="text-gray-300 hover:text-gray-400 cursor-help text-xs ml-1 select-none">ⓘ</span>
    </Tooltip>
  )
}
