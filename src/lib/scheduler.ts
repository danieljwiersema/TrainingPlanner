import type { Zone, Session, DayPlan, PlanConfig, SportDef, SportTarget } from './types'
import { getLabel } from './labelUtils'
import { isHard } from './validator'

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDayName(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return DAY_SHORT[new Date(y, m - 1, d).getDay()]
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
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d + n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
  if (typeof target?.minutesPerWeek === 'number') return Math.max(1, Math.ceil(target.minutesPerWeek / cap))
  const availableDays = dailyMinutes.filter(m => m >= Math.min(cap, 20)).length
  return Math.max(1, Math.min(availableDays, 3))
}

// Resolve minutes/week for sports set to 'default' — they share the weekly goal minus explicit sports
function resolveDefaultMinutes(config: PlanConfig): Record<string, number> {
  const totalAvailable = config.dailyMinutes.reduce((a, b) => a + b, 0)
  const weeklyGoal = config.weeklyMinuteGoal ?? totalAvailable

  const explicitTotal = config.sports.reduce((sum, s) => {
    const m = config.targets[s.id]?.minutesPerWeek
    return sum + (typeof m === 'number' ? m : 0)
  }, 0)

  const remaining = Math.max(0, weeklyGoal - explicitTotal)
  const defaultSports = config.sports.filter(s => config.targets[s.id]?.minutesPerWeek === 'default')
  if (defaultSports.length === 0) return {}

  const totalDefaultSessions = defaultSports.reduce(
    (sum, s) => sum + resolveSessionCount(s, config.targets[s.id], config.dailyMinutes),
    0,
  )

  const result: Record<string, number> = {}
  for (const sport of defaultSports) {
    const sessions = resolveSessionCount(sport, config.targets[sport.id], config.dailyMinutes)
    result[sport.id] = totalDefaultSessions > 0 ? Math.round((sessions / totalDefaultSessions) * remaining) : 0
  }
  return result
}

function buildSlots(config: PlanConfig, lockedCountBySport: Record<string, number>): PlannedSlot[] {
  const { sports, focus, targets, dailyMinutes } = config
  const defaultMinutes = resolveDefaultMinutes(config)
  const focusSport = sports.find(s => s.id === focus)
  const slots: PlannedSlot[] = []

  function getTargetMin(sport: SportDef, total: number): number | null {
    const m = targets[sport.id]?.minutesPerWeek
    if (typeof m === 'number') return Math.round(m / total)
    if (m === 'default' && defaultMinutes[sport.id]) return Math.round(defaultMinutes[sport.id] / total)
    return null
  }

  if (focusSport) {
    const t = targets[focus]
    const total = resolveSessionCount(focusSport, t, dailyMinutes)
    const n = Math.max(0, total - (lockedCountBySport[focus] ?? 0))
    for (let i = 0; i < n; i++) {
      slots.push({ sport: focusSport, zone: 'easy', targetMin: getTargetMin(focusSport, total), isFocus: true, slotIndex: i })
    }
  }

  for (const sport of sports.filter(s => s.id !== focus)) {
    const t = targets[sport.id]
    const total = resolveSessionCount(sport, t, dailyMinutes)
    const n = Math.max(0, total - (lockedCountBySport[sport.id] ?? 0))
    for (let i = 0; i < n; i++) {
      slots.push({ sport, zone: 'easy', targetMin: getTargetMin(sport, total), isFocus: false, slotIndex: i })
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

  const remaining = Array.from({ length: numDays }, (_, i) =>
    Math.max(0, (dailyMinutes[i] ?? 0) - lockedByDay[i].reduce((sum, s) => sum + s.durationMin, 0))
  )

  const placed: Session[][] = lockedByDay.map(sessions => [...sessions])
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
