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

  // Per-day summary: total budget, locked time already used, remaining for AI to fill
  const dayLines = days.map((day, i) => {
    const pref = config.preferredStartTimes?.[i]
    const locked = day.sessions.filter(s => s.locked)
    const lockedMin = locked.reduce((sum, s) => sum + s.durationMin, 0)
    const remaining = Math.max(0, day.availableMin - lockedMin)

    if (day.availableMin === 0) return `  - ${day.day} ${day.date}: REST DAY — leave sessions empty`

    const lockedSummary = locked.length > 0
      ? ` | ${locked.map(s => {
          const sp = config.sports.find(sp => sp.id === s.sportId)
          return `${sp?.name ?? s.sportId} ${s.durationMin}min [LOCKED]`
        }).join(', ')} | ${remaining}min remaining for new sessions`
      : ` | ${day.availableMin}min available`

    return `  - ${day.day} ${day.date}${pref ? ` (preferred start ${pref})` : ''}${lockedSummary}`
  }).join('\n')

  // Locked sessions listed explicitly so the AI knows exactly what to include
  const lockedSections = days.map(day => {
    const locked = day.sessions.filter(s => s.locked)
    if (locked.length === 0) return null
    return locked.map(s => {
      const sp = config.sports.find(sp => sp.id === s.sportId)
      return `  - ${day.day} ${day.date}: sportId="${s.sportId}" (${sp?.name ?? s.sportId}), zone="${s.zone}", durationMin=${s.durationMin}${s.startTime ? `, startTime="${s.startTime}"` : ''} ← INCLUDE THIS EXACTLY`
    }).join('\n')
  }).filter(Boolean)

  // Previous (non-locked) sessions give the AI context on what's already been done
  const existingSections = days.map(day => {
    const unlocked = day.sessions.filter(s => !s.locked)
    if (unlocked.length === 0) return null
    return unlocked.map(s => {
      const sp = config.sports.find(sp => sp.id === s.sportId)
      return `  - ${day.day} ${day.date}: ${sp?.name ?? s.sportId}, ${s.zone}, ${s.durationMin}min (can replace or keep)`
    }).join('\n')
  }).filter(Boolean)

  return `You are an expert endurance sports coach. Generate an optimal weekly training plan as JSON.

ATHLETE CONFIG:
  Week: ${numDays} days starting ${config.weekStartDate}
  Focus sport: ${focusSport?.name ?? config.focus} — prioritise this sport with more volume and harder zones
  Overall intensity: ${config.weekIntensity}

SPORTS & SESSION TARGETS:
${sportLines}

DAILY SCHEDULE (budget = total available, remaining = what's left after locked sessions):
${dayLines}

${lockedSections.length > 0 ? `LOCKED SESSIONS — you MUST include these exactly as shown, do not modify or omit them:
${lockedSections.join('\n')}

` : ''}${existingSections.length > 0 ? `EXISTING (UNLOCKED) SESSIONS — for context only, you may replace or keep these:
${existingSections.join('\n')}

` : ''}INTENSITY ZONES — use these exact strings only:
  "recovery"  → Very easy, active recovery, very low heart rate
  "easy"      → Comfortable aerobic, can hold full conversation
  "moderate"  → Steady/tempo effort, short sentences only
  "hard"      → Threshold or interval work, barely any words
  "flat out"  → Maximum effort, VO2max or sprint

COACHING RULES:
  1. Never schedule back-to-back hard or flat-out sessions (across all sports)
  2. Avoid same sport on consecutive days unless targets require it
  3. New sessions on a day must fit within the remaining time budget shown above
  4. Focus sport gets harder zones; other sports fill complementary roles
  5. Always follow a hard day with easy or recovery next day
  6. Match session counts to targets where possible
  7. Rest days must have an empty sessions array

ATHLETE NOTE: "${userNote || 'none'}"

Return ONLY a valid JSON array with exactly ${numDays} day objects — no markdown, no explanation.

[
  {
    "day": "Mon",
    "date": "YYYY-MM-DD",
    "availableMin": 60,
    "sessions": [
      { "id": "abc1234", "sportId": "run", "zone": "easy", "durationMin": 45, "startTime": "07:00" }
    ]
  }
]

Rules:
- Valid sportId values: ${config.sports.map(s => `"${s.id}"`).join(', ')}
- Valid zone values: "recovery", "easy", "moderate", "hard", "flat out"
- id: unique 7-char alphanumeric string per session
- startTime: optional, only include if a preferred start time applies
- Include ALL sessions in the array for each day — both locked and new ones`
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
