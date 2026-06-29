import type { Zone, SportDef } from './types'

export type SportKind = 'endurance' | 'strength'

export function sportKind(sport: SportDef | undefined): SportKind {
  return sport?.kind ?? 'endurance'
}

// Plain-language descriptions of each zone, by sport kind
const ENDURANCE: Record<Zone, { short: string; desc: string }> = {
  recovery:   { short: 'Recovery',  desc: 'Very easy active recovery — HR zone 1, barely any effort' },
  easy:       { short: 'Easy',      desc: 'Comfortable aerobic — you can hold a full conversation (zone 2)' },
  moderate:   { short: 'Moderate',  desc: 'Steady / tempo — only short sentences (zone 3)' },
  hard:       { short: 'Hard',      desc: 'Threshold / intervals — hard to talk (zone 4)' },
  'flat out': { short: 'Flat out',  desc: 'Maximum effort — VO₂max or sprint (zone 5)' },
}

const STRENGTH: Record<Zone, { short: string; desc: string }> = {
  recovery:   { short: 'Mobility',  desc: 'Mobility / light movement — very light loads, RPE 1–3' },
  easy:       { short: 'Light',     desc: 'Technique focus — light loads, RPE 4–5, lots in reserve' },
  moderate:   { short: 'Moderate',  desc: 'Solid working sets — RPE 6–7, a few reps in reserve' },
  hard:       { short: 'Heavy',     desc: 'Challenging sets — RPE 8–9, close to failure' },
  'flat out': { short: 'Max',       desc: 'Top sets / PR effort — RPE 10, at or near failure' },
}

export function zoneShort(zone: Zone, kind: SportKind): string {
  return (kind === 'strength' ? STRENGTH : ENDURANCE)[zone].short
}

export function zoneDescription(zone: Zone, kind: SportKind): string {
  return (kind === 'strength' ? STRENGTH : ENDURANCE)[zone].desc
}

export const ZONE_ORDER: Zone[] = ['recovery', 'easy', 'moderate', 'hard', 'flat out']

export function zoneLegend(kind: SportKind): { zone: Zone; short: string; desc: string }[] {
  const map = kind === 'strength' ? STRENGTH : ENDURANCE
  return ZONE_ORDER.map(z => ({ zone: z, short: map[z].short, desc: map[z].desc }))
}
