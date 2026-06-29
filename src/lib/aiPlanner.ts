import type { DayPlan, PlanConfig, Session, Zone } from './types'
import { getLabel } from './labelUtils'
import { emptyPlan } from './scheduler'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

const VALID_ZONES = new Set<Zone>(['recovery', 'easy', 'moderate', 'hard', 'flat out'])

function buildPrompt(config: PlanConfig, existingPlan: DayPlan[], userNote: string): string {
  const numDays = config.numDays ?? 7
  // Always use existingPlan for locked session context; fall back to emptyPlan for structure only
  const baseDays = emptyPlan(config)
  const days = baseDays.map((base, i) => existingPlan[i] ? { ...base, sessions: existingPlan[i].sessions } : base)
  const focusSport = config.sports.find(s => s.id === config.focus)

  const sportLines = config.sports.map(sport => {
    const t = config.targets[sport.id]
    if (!t) return null
    const sess = t.sessionsPerWeek === 'auto' ? 'auto' : t.sessionsPerWeek
    const mins = t.minutesPerWeek ? `, ~${t.minutesPerWeek}min/week total` : ''
    const intens = t.intensity ? `, intensity: ${t.intensity}` : ''
    return `  - ${sport.name} (id: "${sport.id}"): ${sess} sessions/week${mins}${intens}`
  }).filter(Boolean).join('\n')

  // Per-day: show total budget, what's locked (already committed), and how much is left for AI to fill
  const dayLines = days.map((day, i) => {
    const pref = config.preferredStartTimes?.[i]
    const locked = day.sessions.filter(s => s.locked)
    const lockedMin = locked.reduce((sum, s) => sum + s.durationMin, 0)
    const remaining = Math.max(0, day.availableMin - lockedMin)

    if (day.availableMin === 0) return `  - ${day.day} ${day.date}: REST DAY — return empty sessions array`

    const lockedDetail = locked.length > 0
      ? locked.map(s => {
          const sp = config.sports.find(sp => sp.id === s.sportId)
          return `${sp?.name ?? s.sportId} ${s.zone} ${s.durationMin}min`
        }).join(' + ')
      : null

    return `  - ${day.day} ${day.date}:${pref ? ` preferred start ${pref},` : ''} ${remaining}min to fill${lockedDetail ? ` (${lockedMin}min already locked: ${lockedDetail})` : ''}`
  }).join('\n')

  // Locked sessions for context only — AI must NOT include these in output
  const lockedContextLines = days.flatMap(day =>
    day.sessions.filter(s => s.locked).map(s => {
      const sp = config.sports.find(sp => sp.id === s.sportId)
      return `  - ${day.day}: ${sp?.name ?? s.sportId} ${s.zone} ${s.durationMin}min — already scheduled, do not add more of same sport this day unless targets require it`
    })
  )

  // Existing unlocked sessions for context
  const existingContextLines = days.flatMap(day =>
    day.sessions.filter(s => !s.locked).map(s => {
      const sp = config.sports.find(sp => sp.id === s.sportId)
      return `  - ${day.day}: ${sp?.name ?? s.sportId} ${s.zone} ${s.durationMin}min (existing, will be replaced by your output)`
    })
  )

  return `You are an expert endurance sports coach. Generate NEW training sessions to fill each day's remaining time budget.

IMPORTANT: Locked sessions are handled automatically — do NOT include them in your JSON output. Only output the NEW sessions you are adding.

ATHLETE CONFIG:
  Week: ${numDays} days starting ${config.weekStartDate}
  Focus sport: ${focusSport?.name ?? config.focus} — prioritise with more volume and harder zones
  Overall intensity: ${config.weekIntensity}

SPORTS & SESSION TARGETS (for the whole week):
${sportLines}

DAILY TIME REMAINING (minutes you need to fill with new sessions):
${dayLines}
${lockedContextLines.length > 0 ? `
ALREADY LOCKED THIS WEEK (context only — do not output these, do not duplicate these sports on same day unless necessary):
${lockedContextLines.join('\n')}
` : ''}${existingContextLines.length > 0 ? `
EXISTING UNLOCKED SESSIONS (context only — your output replaces these):
${existingContextLines.join('\n')}
` : ''}
INTENSITY ZONES — use these exact strings:
  "recovery"  → Very easy, active recovery
  "easy"      → Comfortable aerobic, full conversation possible
  "moderate"  → Steady/tempo, short sentences only
  "hard"      → Threshold or intervals, barely speaking
  "flat out"  → Maximum effort, VO2max or sprint

COACHING RULES:
  1. Do not back-to-back hard/flat-out sessions on consecutive days
  2. Avoid same sport on consecutive days unless targets require it
  3. New sessions must fit within the remaining time shown above — do not exceed it
  4. Follow hard sessions with easy or recovery the next day
  5. Focus sport gets the hardest zones and most sessions
  6. Rest days (0min) must have an empty sessions array

ATHLETE NOTE: "${userNote || 'none'}"

Return ONLY a JSON array with exactly ${numDays} elements — no markdown, no explanation.
Each element has "day", "date", "availableMin", and "sessions" (new sessions only, not locked ones).

Valid sportId values: ${config.sports.map(s => `"${s.id}"`).join(', ')}
Valid zone values: "recovery", "easy", "moderate", "hard", "flat out"
Each session needs: id (7-char alphanumeric), sportId, zone, durationMin. startTime is optional.`
}

function parseAndValidate(input: string | unknown[], config: PlanConfig, existingPlan: DayPlan[]): DayPlan[] {
  let parsed: unknown[]
  if (Array.isArray(input)) {
    parsed = input
  } else {
    const cleaned = input.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    parsed = JSON.parse(cleaned) as unknown[]
  }

  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('AI returned non-array response')

  const numDays = config.numDays ?? 7
  if (parsed.length !== numDays) throw new Error(`Expected ${numDays} days, got ${parsed.length}`)

  const validIds = new Set(config.sports.map(s => s.id))

  return (parsed as Record<string, unknown>[]).map((day, i) => {
    if (!day['day'] || !day['date'] || !Array.isArray(day['sessions'])) {
      throw new Error(`Day ${i} missing required fields`)
    }

    const lockedSessions = existingPlan[i]?.sessions.filter(s => s.locked) ?? []

    const aiSessions: Session[] = (day['sessions'] as Record<string, unknown>[])
      .filter(s => s && typeof s['sportId'] === 'string' && typeof s['zone'] === 'string')
      .map(s => {
        const sportId = s['sportId'] as string
        const zone = s['zone'] as string
        if (!validIds.has(sportId)) throw new Error(`Unknown sportId "${sportId}"`)
        if (!VALID_ZONES.has(zone as Zone)) throw new Error(`Unknown zone "${zone}"`)
        const sp = config.sports.find(sp => sp.id === sportId)
        return {
          id: (typeof s['id'] === 'string' && (s['id'] as string).length >= 4) ? s['id'] as string : Math.random().toString(36).slice(2, 9),
          sportId,
          zone: zone as Zone,
          durationMin: Math.max(15, Math.min(300, Number(s['durationMin']) || 30)),
          label: sp ? getLabel(sp, zone as Zone) : zone,
          startTime: typeof s['startTime'] === 'string' ? s['startTime'] as string : undefined,
          userEdited: false,
        } satisfies Session
      })

    return {
      day: day['day'] as string,
      date: day['date'] as string,
      availableMin: (day['availableMin'] as number | undefined) ?? (config.dailyMinutes[i] ?? 0),
      sessions: [...lockedSessions, ...aiSessions],
    }
  })
}

export async function generatePlanWithAI(
  config: PlanConfig,
  existingPlan: DayPlan[],
  userNote: string,
): Promise<DayPlan[]> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string
  if (!apiKey) throw new Error('Groq API key not configured — contact the site owner')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert endurance sports coach. Always respond with valid JSON only — no markdown, no explanation.',
        },
        {
          role: 'user',
          content: buildPrompt(config, existingPlan, userNote),
        },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid Groq API key — check console.groq.com')
    if (res.status === 429) throw new Error('Rate limit reached — wait a moment and try again')
    if (res.status === 402) throw new Error('Groq API quota exceeded — check console.groq.com')
    const body = await res.text()
    throw new Error(`Groq error ${res.status}: ${body.slice(0, 120)}`)
  }

  const data = await res.json() as {
    choices?: { message: { content: string } }[]
    error?: { message: string }
  }

  if (data.error) throw new Error(data.error.message)

  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from AI')

  // Grok with response_format:json_object returns a wrapped object — unwrap if needed
  const parsed = JSON.parse(text)
  const planArray = Array.isArray(parsed) ? parsed : (parsed.plan ?? parsed.days ?? parsed.schedule ?? Object.values(parsed)[0])
  if (!Array.isArray(planArray)) throw new Error('AI returned unexpected JSON shape')

  return parseAndValidate(planArray as unknown[], config, existingPlan)
}
