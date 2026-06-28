import type { DayPlan, Session, PlanConfig, SportDef } from './types'

function formatGCalDate(isoDate: string, time: string): string {
  const [y, m, d] = isoDate.split('-')
  const [h, min] = time.split(':')
  return `${y}${m}${d}T${h}${min}00`
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

export function gcalUrl(session: Session, isoDate: string, sport: SportDef | undefined): string {
  const start = session.startTime ?? '07:00'
  const end = addMinutes(start, session.durationMin)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: session.label,
    dates: `${formatGCalDate(isoDate, start)}/${formatGCalDate(isoDate, end)}`,
    details: `Sport: ${sport?.name ?? session.sportId}\nZone: ${session.zone}\nDuration: ${session.durationMin} min`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function icsDate(isoDate: string, time: string): string {
  const [y, m, d] = isoDate.split('-')
  const [h, min] = time.split(':')
  return `${y}${m}${d}T${h}${min}00`
}

export function exportICS(plan: DayPlan[], config: PlanConfig): void {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//Training Planner//EN',
  ]

  for (const day of plan) {
    for (const session of day.sessions) {
      const sport = config.sports.find(s => s.id === session.sportId)
      const start = session.startTime ?? '07:00'
      const end = addMinutes(start, session.durationMin)
      const uid = `${day.date}-${session.id}@training-planner`

      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTART:${icsDate(day.date, start)}`,
        `DTEND:${icsDate(day.date, end)}`,
        `SUMMARY:${session.label}`,
        `DESCRIPTION:Sport: ${sport?.name ?? session.sportId}\\nZone: ${session.zone}\\nDuration: ${session.durationMin} min`,
        'END:VEVENT',
      )
    }
  }

  lines.push('END:VCALENDAR')

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `training-week-${plan[0]?.date ?? 'export'}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
