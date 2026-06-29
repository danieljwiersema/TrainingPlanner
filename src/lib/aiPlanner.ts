import type { DayPlan, PlanConfig, Session, Zone } from './types'
import { getLabel } from './labelUtils'
import { emptyPlan } from './scheduler'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'

const VALID_ZONES = new Set<Zone>(['recovery', 'easy', 'moderate', 'hard', 'flat out'])

function buildPrompt(config: PlanConfig, existingPlan: DayPlan[], userNote: string): string {
  const numDays = config.numDays ?? 7
  const days = existingPlan.length === numDays ? existingPlan : emptyPlan(config)
  const focusSport = config.sports.find(s => s.id === config.focus)

  const sportLines = config.sports.map(sport => {
    const t = config.targets[sport.id]
    if (!t) return null
    const sess = t.sessionsPerWeek === 'auto' ? 'auto' : t.sessionsPerWeek
    const mins = t.minutesPerWeek ? `, ~${t.minutesPerWeek}min/week total` : ''
    const intens = t.intensity ? `, intensity: ${t.intensity}` : ''
    return `  - ${sport.name} (id: "${sport.id}"): ${sess} sessions/week${mins}${intens}`
  }).filter(Boolean).join('\n')

  const dayLines = days.map((day, i) => {
    const pref = config.preferredStartTimes?.[i]
    return `  - ${day.day} ${day.date}: ${day.availableMin}min${pref ? ` (start ${pref})` : ''}${day.availableMin === 0 ? ' — REST DAY, no sessions' : ''}`
  }).join('\n')

  const lockedLines = days.flatMap(day =>
    day.sessions.filter(s => s.locked).map(s => {
      const sp = config.sports.find(sp => sp.id === s.sportId)
      return `  - ${day.day} ${day.date}: ${sp?.name ?? s.sportId}, ${s.zone}, ${s.durationMin}min${s.startTime ? ` at ${s.startTime}` : ''} [LOCKED — keep exactly]`
    })
  )

  return `You are an expert endurance sports coach. Generate an optimal weekly training plan as JSON.

WEEK: ${numDays} days starting ${config.weekStartDate}
FOCUS SPORT: ${focusSport?.name ?? config.focus} (give this sport harder zones and more volume)
DEFAULT INTENSITY: ${config.weekIntensity}

SPORTS & TARGETS:
${sportLines}

DAILY TIME BUDGETS:
${dayLines}

INTENSITY ZONES (use these exact strings):
  - "recovery": Very easy, active recovery only
  - "easy": Comfortable aerobic, can hold full conversation
  - "moderate": Steady/tempo, short sentences only
  - "hard": Threshold or interval work, few words
  - "flat out": Maximum effort, VO2max or sprint

${lockedLines.length > 0 ? `LOCKED SESSIONS (include these exactly as given):\n${lockedLines.join('\n')}\n` : ''}ATHLETE NOTE: "${userNote || 'none'}"

COACHING RULES (soft guidelines, not rigid):
1. Avoid back-to-back hard/flat-out sessions across all sports
2. Don't repeat same sport on consecutive days unless unavoidable
3. Total session time on a day should not exceed its availableMin budget
4. Focus sport gets harder zones; secondary sports complement it
5. Follow hard sessions with recovery or easy sessions next day
6. Rest days (0min) must have empty sessions array
7. Respect session count targets per sport where possible

Return ONLY a valid JSON array — no markdown, no explanation, nothing else.

Schema (exactly ${numDays} elements):
[
  {
    "day": "Mon",
    "date": "YYYY-MM-DD",
    "availableMin": 60,
    "sessions": [
      {
        "id": "abc1234",
        "sportId": "run",
        "zone": "easy",
        "durationMin": 45,
        "startTime": "07:00"
      }
    ]
  }
]

Valid sportId values: ${config.sports.map(s => `"${s.id}"`).join(', ')}
Valid zone values: "recovery", "easy", "moderate", "hard", "flat out"
id must be a unique 7-character alphanumeric string per session.
startTime is optional — include only if a preferred start time was given for that day.`
}

function parseAndValidate(text: string, config: PlanConfig, existingPlan: DayPlan[]): DayPlan[] {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  const parsed = JSON.parse(cleaned) as DayPlan[]

  if (!Array.isArray(parsed)) throw new Error('AI returned non-array response')

  const numDays = config.numDays ?? 7
  if (parsed.length !== numDays) throw new Error(`Expected ${numDays} days, got ${parsed.length}`)

  const validIds = new Set(config.sports.map(s => s.id))

  return parsed.map((day, i) => {
    if (!day.day || !day.date || !Array.isArray(day.sessions)) {
      throw new Error(`Day ${i} missing required fields`)
    }

    const lockedSessions = existingPlan[i]?.sessions.filter(s => s.locked) ?? []

    const aiSessions: Session[] = day.sessions
      .filter(s => s && typeof s.sportId === 'string' && typeof s.zone === 'string')
      .map(s => {
        if (!validIds.has(s.sportId)) throw new Error(`Unknown sportId "${s.sportId}"`)
        if (!VALID_ZONES.has(s.zone as Zone)) throw new Error(`Unknown zone "${s.zone}"`)
        const sp = config.sports.find(sp => sp.id === s.sportId)
        return {
          id: (typeof s.id === 'string' && s.id.length >= 4) ? s.id : Math.random().toString(36).slice(2, 9),
          sportId: s.sportId as string,
          zone: s.zone as Zone,
          durationMin: Math.max(15, Math.min(300, Number(s.durationMin) || 30)),
          label: sp ? getLabel(sp, s.zone as Zone) : (s.zone as string),
          startTime: typeof s.startTime === 'string' ? s.startTime : undefined,
          userEdited: false,
        } satisfies Session
      })

    return {
      day: day.day as string,
      date: day.date as string,
      availableMin: day.availableMin ?? (config.dailyMinutes[i] ?? 0),
      sessions: [...lockedSessions, ...aiSessions],
    }
  })
}

export async function generatePlanWithAI(
  config: PlanConfig,
  existingPlan: DayPlan[],
  userNote: string,
): Promise<DayPlan[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string
  if (!apiKey) throw new Error('Gemini API key not configured — contact the site owner')
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(config, existingPlan, userNote) }] }],
      generationConfig: {
        temperature: 0.6,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!res.ok) {
    if (res.status === 400) throw new Error('Invalid API key — get a free one at aistudio.google.com')
    if (res.status === 429) throw new Error('Rate limit reached — wait a moment and try again')
    if (res.status === 403) throw new Error('API key does not have access to Gemini — check aistudio.google.com')
    const body = await res.text()
    throw new Error(`Gemini error ${res.status}: ${body.slice(0, 120)}`)
  }

  const data = await res.json() as {
    candidates?: { content: { parts: { text: string }[] } }[]
    error?: { message: string }
  }

  if (data.error) throw new Error(data.error.message)

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from AI')

  return parseAndValidate(text, config, existingPlan)
}
