import type { Zone, Session, DayPlan, PlanConfig, WeekIntensity, SportDef, SportTarget } from './types'
import { getLabel } from './labelUtils'
import { isHard } from './validator'

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDayName(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  return DAY_SHORT[d.getDay()]
}

const FOCUS_ZONES: Record<WeekIntensity, Zone[]> = {
  light:    ['easy',     'recovery', 'easy',     'recovery'],
  moderate: ['moderate', 'easy',     'moderate', 'easy'],
  hard:     ['hard',     'moderate', 'easy',     'moderate'],
  peak:     ['flat out', 'hard',     'moderate', 'hard'],
}

const SECONDARY_ZONES: Record<WeekIntensity, Zone[]> = {
  light:    ['recovery', 'easy',     'recovery', 'easy'],
  moderate: ['easy',     'easy',     'moderate', 'easy'],
  hard:     ['easy',     'moderate', 'easy',     'moderate'],
  peak:     ['moderate', 'easy',     'moderate', 'hard'],
}

const ZONE_ORDER: Record<Zone, number> = {
  'flat out': 0, hard: 1, moderate: 2, easy: 3, recovery: 4,
}

export const SPORT_SESSION_CAP: Record<string, number> = {
  swim: 90, bike: 180, run: 90, strength: 70,
}
export const DEFAULT_SESSION_CAP = 90

function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

function makeSession(sport: SportDef, zone: Zone, durationMin: number): Session {
  return { id: uid(), sportId: sport.id, zone, durationMin, label: getLabel(sport, zone) }
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

interface PlannedSlot {
  sport: SportDef
  zone: Zone
  targetMin: number | null
  isFocus: boolean
  slotIndex: number
}

export function resolveSessionCount(sport: SportDef, target: SportTarget | undefined, dailyMinutes: number[]): number {
  const raw = target?.sessionsPerWeek
  if (typeof raw === 'number') return raw
  const cap = SPORT_SESSION_CAP[sport.id] ?? DEFAULT_SESSION_CAP
  if (target?.minutesPerWeek) return Math.max(1, Math.ceil(target.minutesPerWeek / cap))
  const availableDays = dailyMinutes.filter(m => m >= Math.min(cap, 20)).length
  return Math.max(1, Math.min(availableDays, 3))
}

function buildSlots(config: PlanConfig, lockedCountBySport: Record<string, number>): PlannedSlot[] {
  const { sports, focus, weekIntensity, targets, dailyMinutes } = config
  const focusSport = sports.find(s => s.id === focus)
  const secondaries = sports.filter(s => s.id !== focus)
  const slots: PlannedSlot[] = []

  if (focusSport) {
    const t = targets[focus]
    const sportIntensity = t?.intensity ?? weekIntensity
    const total = resolveSessionCount(focusSport, t, dailyMinutes)
    const n = Math.max(0, total - (lockedCountBySport[focus] ?? 0))
    const focusZones = FOCUS_ZONES[sportIntensity]
    for (let i = 0; i < n; i++) {
      slots.push({
        sport: focusSport,
        zone: focusZones[Math.min(i, focusZones.length - 1)],
        targetMin: t?.minutesPerWeek ? Math.round(t.minutesPerWeek / total) : null,
        isFocus: true,
        slotIndex: i,
      })
    }
  }

  for (const sport of secondaries) {
    const t = targets[sport.id]
    const sportIntensity = t?.intensity ?? weekIntensity
    const total = resolveSessionCount(sport, t, dailyMinutes)
    const n = Math.max(0, total - (lockedCountBySport[sport.id] ?? 0))
    const secZones = SECONDARY_ZONES[sportIntensity]
    for (let i = 0; i < n; i++) {
      slots.push({
        sport,
        zone: secZones[Math.min(i, secZones.length - 1)],
        targetMin: t?.minutesPerWeek ? Math.round(t.minutesPerWeek / total) : null,
        isFocus: false,
        slotIndex: i,
      })
    }
  }

  return slots.sort((a, b) => {
    if (a.isFocus !== b.isFocus) return a.isFocus ? -1 : 1
    if (ZONE_ORDER[a.zone] !== ZONE_ORDER[b.zone]) return ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone]
    return a.slotIndex - b.slotIndex
  })
}

function scoreDayForSlot(
  dayIdx: number,
  slot: PlannedSlot,
  placed: Session[][],
  remaining: number[],
  lastDayForSport: Map<string, number>,
  focus: string,
): number {
  const avail = remaining[dayIdx]
  const needed = slot.targetMin ?? (SPORT_SESSION_CAP[slot.sport.id] ?? DEFAULT_SESSION_CAP)

  if (avail < 20) return Infinity

  let score = 0

  score -= Math.min(avail, needed) * 0.3

  if (slot.targetMin && avail < slot.targetMin * 0.7) score += 60

  if (placed[dayIdx].some(s => s.sportId === slot.sport.id)) score += 200

  if (isHard(slot.zone)) {
    if (dayIdx > 0 && placed[dayIdx - 1].some(s => isHard(s.zone))) score += 120
    if (placed[dayIdx].some(s => isHard(s.zone))) score += 300
    if (dayIdx < 6 && placed[dayIdx + 1].some(s => isHard(s.zone))) score += 80
  }

  if (slot.sport.id === 'strength') {
    if (dayIdx < 6 && placed[dayIdx + 1].some(s => s.sportId === focus && isHard(s.zone))) score += 90
    if (dayIdx > 0 && placed[dayIdx - 1].some(s => s.sportId === focus && isHard(s.zone))) score += 40
  }

  const last = lastDayForSport.get(slot.sport.id)
  if (last !== undefined) {
    const gap = dayIdx - last
    if (gap <= 0) score += 500
    else if (gap === 1) score += 80
    else if (gap === 2) score += 20
  }

  if (placed[dayIdx].length === 0) score -= 8

  return score
}

function computeStartTime(preferred: string, existing: Session[]): string {
  const [ph, pm] = preferred.split(':').map(Number)
  let startMin = ph * 60 + pm
  for (const s of existing) {
    if (s.startTime) {
      const [sh, sm] = s.startTime.split(':').map(Number)
      const endMin = sh * 60 + sm + s.durationMin + 15
      if (endMin > startMin) startMin = endMin
    }
  }
  const h = Math.floor(startMin / 60) % 24
  const m = startMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function emptyPlan(config: PlanConfig): DayPlan[] {
  const n = config.numDays ?? 7
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(config.weekStartDate, i)
    return { day: getDayName(date), date, availableMin: config.dailyMinutes[i] ?? 0, sessions: [] }
  })
}

export function generatePlan(config: PlanConfig, existingPlan?: DayPlan[]): DayPlan[] {
  const { dailyMinutes, weekStartDate, focus } = config
  const numDays = config.numDays ?? 7

  // Collect locked sessions per day and count per sport
  const lockedByDay: Session[][] = Array.from({ length: numDays }, (_, i) =>
    existingPlan?.[i]?.sessions.filter(s => s.locked) ?? []
  )
  const lockedCountBySport: Record<string, number> = {}
  for (const sessions of lockedByDay) {
    for (const s of sessions) {
      lockedCountBySport[s.sportId] = (lockedCountBySport[s.sportId] ?? 0) + 1
    }
  }

  const slots = buildSlots(config, lockedCountBySport)

  // Start remaining time after subtracting locked sessions
  const remaining = Array.from({ length: numDays }, (_, i) =>
    Math.max(0, (dailyMinutes[i] ?? 0) - lockedByDay[i].reduce((sum, s) => sum + s.durationMin, 0))
  )

  // placed starts with locked sessions; new sessions will be appended
  const placed: Session[][] = lockedByDay.map(sessions => [...sessions])

  // Seed lastDayForSport from locked sessions
  const lastDayForSport: Map<string, number> = new Map()
  placed.forEach((sessions, i) => {
    for (const s of sessions) {
      const prev = lastDayForSport.get(s.sportId)
      if (prev === undefined || i > prev) lastDayForSport.set(s.sportId, i)
    }
  })

  const MIN_DURATION = 20

  for (const slot of slots) {
    const cap = SPORT_SESSION_CAP[slot.sport.id] ?? DEFAULT_SESSION_CAP

    const candidates = Array.from({ length: numDays }, (_, i) => ({
      i,
      score: scoreDayForSlot(i, slot, placed, remaining, lastDayForSport, focus),
    }))
      .filter(c => c.score < Infinity)
      .sort((a, b) => a.score - b.score)

    if (candidates.length === 0) continue

    const dayIdx = candidates[0].i
    const duration = slot.targetMin
      ? Math.min(slot.targetMin, remaining[dayIdx])
      : Math.min(remaining[dayIdx], cap)

    if (duration < MIN_DURATION) continue

    const session = makeSession(slot.sport, slot.zone, duration)
    const pt = config.preferredStartTimes?.[dayIdx]
    if (pt) session.startTime = computeStartTime(pt, placed[dayIdx])
    placed[dayIdx].push(session)
    remaining[dayIdx] -= duration
    lastDayForSport.set(slot.sport.id, dayIdx)
  }

  return placed.map((sessions, i) => {
    const date = addDays(weekStartDate, i)
    return { day: getDayName(date), date, availableMin: dailyMinutes[i] ?? 0, sessions }
  })
}
