export type Zone = 'recovery' | 'easy' | 'moderate' | 'hard' | 'flat out'
export type WeekIntensity = 'light' | 'moderate' | 'hard' | 'peak'

export interface SportDef {
  id: string
  name: string
  icon: string
  color: string
}

export interface SportTarget {
  sessionsPerWeek: number | 'auto'
  minutesPerWeek?: number
}

export interface Session {
  id: string
  sportId: string
  zone: Zone
  durationMin: number
  startTime?: string   // "07:30"
  label: string
  userEdited?: boolean
  locked?: boolean
}

export interface DayPlan {
  day: string       // 'Mon', 'Tue', etc.
  date: string      // ISO date 'YYYY-MM-DD'
  availableMin: number
  sessions: Session[]
}

export interface PlanConfig {
  sports: SportDef[]
  focus: string           // sportId
  weekIntensity: WeekIntensity
  weekStartDate: string   // ISO date 'YYYY-MM-DD', Monday
  dailyMinutes: number[]  // 0=Mon … 6=Sun
  targets: Record<string, SportTarget>
}

export interface PlanWarning {
  type: 'back-to-back-hard' | 'same-sport-consecutive' | 'target-not-met'
  sportId: string
  message: string
  dayIndex: number
}

export const DEFAULT_SPORTS: SportDef[] = [
  { id: 'swim',     name: 'Swim',     icon: '🏊', color: '#3b82f6' },
  { id: 'bike',     name: 'Bike',     icon: '🚴', color: '#eab308' },
  { id: 'run',      name: 'Run',      icon: '🏃', color: '#22c55e' },
  { id: 'strength', name: 'Strength', icon: '💪', color: '#a855f7' },
]
