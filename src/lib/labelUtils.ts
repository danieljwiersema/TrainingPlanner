import type { Zone, SportDef } from './types'

const CURATED_LABELS: Record<string, Record<Zone, string>> = {
  swim:     { recovery: 'Easy Swim',        easy: 'Technique Swim',  moderate: 'Steady Swim',      hard: 'Threshold Sets',   'flat out': 'Race-Pace Sets' },
  bike:     { recovery: 'Easy Spin',        easy: 'Endurance Ride',  moderate: 'Tempo Ride',        hard: 'Threshold Ride',   'flat out': 'Race Effort Ride' },
  run:      { recovery: 'Easy Jog',         easy: 'Aerobic Run',     moderate: 'Tempo Run',         hard: 'Interval Run',     'flat out': 'Race Effort Run' },
  strength: { recovery: 'Mobility Session', easy: 'Light Strength',  moderate: 'Strength Session',  hard: 'Heavy Strength',   'flat out': 'Max Effort Strength' },
}

const ZONE_PREFIX: Record<Zone, string> = {
  recovery: 'Recovery', easy: 'Easy', moderate: 'Steady', hard: 'Hard', 'flat out': 'Race Effort',
}

export function getLabel(sport: SportDef, zone: Zone): string {
  return CURATED_LABELS[sport.id]?.[zone] ?? `${ZONE_PREFIX[zone]} ${sport.name}`
}
