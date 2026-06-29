import type { DayPlan, PlanConfig, PlanWarning, Zone } from './types'

export function isHard(zone: Zone): boolean {
  return zone === 'hard' || zone === 'flat out'
}

function checkBackToBackHard(plan: DayPlan[]): PlanWarning[] {
  const warnings: PlanWarning[] = []
  for (let i = 0; i < 6; i++) {
    const todayHard = plan[i].sessions.filter(s => isHard(s.zone))
    const tomorrowHard = plan[i + 1].sessions.filter(s => isHard(s.zone))
    if (todayHard.length > 0 && tomorrowHard.length > 0) {
      warnings.push({
        type: 'back-to-back-hard',
        sportId: tomorrowHard[0].sportId,
        dayIndex: i + 1,
        message: `Hard sessions on consecutive days (${plan[i].day} → ${plan[i + 1].day}) — consider moving one`,
      })
    }
  }
  return warnings
}

function checkSameSportConsecutive(plan: DayPlan[], config: PlanConfig): PlanWarning[] {
  const warnings: PlanWarning[] = []
  for (let i = 0; i < 6; i++) {
    const todaySports = new Set(plan[i].sessions.map(s => s.sportId))
    for (const s of plan[i + 1].sessions) {
      if (todaySports.has(s.sportId)) {
        const sport = config.sports.find(sp => sp.id === s.sportId)
        warnings.push({
          type: 'same-sport-consecutive',
          sportId: s.sportId,
          dayIndex: i + 1,
          message: `${sport?.name ?? s.sportId} on consecutive days (${plan[i].day} → ${plan[i + 1].day})`,
        })
      }
    }
  }
  return warnings
}

function checkTargetsNotMet(plan: DayPlan[], config: PlanConfig): PlanWarning[] {
  const warnings: PlanWarning[] = []
  for (const [sportId, target] of Object.entries(config.targets)) {
    if (!target.sessionsPerWeek || target.sessionsPerWeek === 'auto') continue
    const placed = plan.reduce((n, d) => n + d.sessions.filter(s => s.sportId === sportId).length, 0)
    if (placed < target.sessionsPerWeek) {
      const sport = config.sports.find(s => s.id === sportId)
      warnings.push({
        type: 'target-not-met',
        sportId,
        dayIndex: -1,
        message: `${sport?.name ?? sportId}: placed ${placed} of ${target.sessionsPerWeek} target sessions — not enough available time`,
      })
    }
  }
  return warnings
}

function checkOrphanSports(plan: DayPlan[], config: PlanConfig): PlanWarning[] {
  const validIds = new Set(config.sports.map(s => s.id))
  const seen = new Set<string>()
  const warnings: PlanWarning[] = []
  plan.forEach((day, i) => {
    for (const s of day.sessions) {
      if (!validIds.has(s.sportId) && !seen.has(s.sportId)) {
        seen.add(s.sportId)
        warnings.push({
          type: 'orphan-sport',
          sportId: s.sportId,
          dayIndex: i,
          message: `A session uses a sport that was removed — reassign it (click the card) or delete it`,
        })
      }
    }
  })
  return warnings
}

export function validatePlan(plan: DayPlan[], config: PlanConfig): PlanWarning[] {
  return [
    ...checkBackToBackHard(plan),
    ...checkSameSportConsecutive(plan, config),
    ...checkTargetsNotMet(plan, config),
    ...checkOrphanSports(plan, config),
  ]
}
