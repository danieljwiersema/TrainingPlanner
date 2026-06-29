export type Zone = 'recovery' | 'easy' | 'moderate' | 'hard' | 'flat out'
export type WeekIntensity = 'light' | 'moderate' | 'hard' | 'peak'

export interface SportDef {
  id: string
  name: string
  icon: string
  color: string
  kind?: 'endurance' | 'strength'  // affects zone language & AI prompting; defaults to endurance
}

export interface SportTarget {
  sessionsPerWeek: number | 'auto'
  minutesPerWeek?: number | 'default'
}

export interface Session {
  id: string
  sportId: string
  zone: Zone
  durationMin: number
  startTime?: string   // "07:30"
  label: string
  notes?: string
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
  preferredStartTimes?: (string | undefined)[]  // "07:30" per day
  numDays?: number  // how many days to schedule (default 7)
  weeklyMinuteGoal?: number  // total weekly training time target (affects 'default' sport minutes)
}

export interface PlanWarning {
  type: 'back-to-back-hard' | 'same-sport-consecutive' | 'target-not-met' | 'orphan-sport'
  sportId: string
  message: string
  dayIndex: number
}

export const DEFAULT_SPORTS: SportDef[] = [
  { id: 'swim',     name: 'Swim',     icon: '🏊', color: '#3b82f6', kind: 'endurance' },
  { id: 'bike',     name: 'Bike',     icon: '🚴', color: '#eab308', kind: 'endurance' },
  { id: 'run',      name: 'Run',      icon: '🏃', color: '#22c55e', kind: 'endurance' },
  { id: 'strength', name: 'Strength', icon: '💪', color: '#a855f7', kind: 'strength' },
]
