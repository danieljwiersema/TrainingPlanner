import type { DayPlan, PlanConfig, Session, Zone } from './types'
import { getLabel } from './labelUtils'
import { emptyPlan } from './scheduler'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

const VALID_ZONES = new Set<Zone>(['recovery', 'easy', 'moderate', 'hard', 'flat out'])

export interface WizardAnswers {
  purpose: string
  level: 'beginner' | 'intermediate' | 'advanced' | 'elite'
  levelNote: string
  weaknesses: string[]
  weaknessNote: string
  injuries: string
  setupMode: 'current' | 'ai-decides'
}

export interface FollowUpQuestion {
  id: string
  question: string
  type: 'select' | 'text'
  options?: string[]
}

async function callGroq(messages: { role: string; content: string }[], temperature = 0.3): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string
  if (!apiKey) throw new Error('Groq API key not configured — contact the site owner')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature }),
  })

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid Groq API key — check console.groq.com')
    if (res.status === 429) throw new Error('Rate limit reached — wait a moment and try again')
    const body = await res.text()
    throw new Error(`Groq error ${res.status}: ${body.slice(0, 120)}`)
  }

  const data = await res.json() as { choices?: { message: { content: string } }[]; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from AI')
  return text
}

function parseJSON(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  return JSON.parse(cleaned)
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export async function evaluateWizardAnswers(
  config: PlanConfig,
  answers: WizardAnswers,
): Promise<{ ready: boolean; questions?: FollowUpQuestion[] }> {
  const focusSport = config.sports.find(s => s.id === config.focus)
  const sportNames = config.sports.map(s => s.name).join(', ')
  const totalWeeklyMin = config.dailyMinutes.reduce((a, b) => a + b, 0)

  const prompt = `You are preparing to generate a personalised training plan. Review the athlete's answers and decide if you need 1–2 more targeted questions to make the plan significantly better, or if you have enough to proceed.

ATHLETE ANSWERS:
  Training purpose: "${answers.purpose}"
  Experience level: ${answers.level}${answers.levelNote ? ` — specifically: "${answers.levelNote}"` : ''}
  Weak areas / focus: ${answers.weaknesses.length ? answers.weaknesses.join(', ') : 'none specified'}${answers.weaknessNote ? ` — "${answers.weaknessNote}"` : ''}
  Injuries / physical constraints: ${answers.injuries.trim() || 'none reported'}
  Schedule preference: ${answers.setupMode === 'current' ? 'Use current setup exactly' : 'AI redistributes sessions within daily time budgets'}

THEIR CURRENT SETUP:
  Sports: ${sportNames}
  Primary focus sport: ${focusSport?.name ?? config.focus}
  Weekly intensity: ${config.weekIntensity}
  Total weekly time available: ${totalWeeklyMin}min across ${config.numDays ?? 7} days

Decide: does the purpose + level + focus give you enough to write a genuinely tailored plan? Or would 1–2 specific questions meaningfully improve it?

Only ask follow-up questions if:
- The purpose mentions a specific event/race (ask timeframe or specific demands)
- The weaknesses are vague and specifics would change session design
- There is an obvious gap that would affect session type or intensity choices

Do NOT ask about things already answerable from their setup (sports, times, intensity).
Do NOT ask more than 2 questions.
If in doubt, proceed — a good plan is better than extra friction.

Respond with raw JSON only, no markdown:
{ "ready": true }
OR
{ "ready": false, "questions": [{ "id": "q1", "question": "...", "type": "select", "options": ["...", "..."] }, { "id": "q2", "question": "...", "type": "text" }] }`

  const text = await callGroq([
    { role: 'system', content: 'You are an expert sports coach assistant. Respond with raw JSON only.' },
    { role: 'user', content: prompt },
  ], 0.2)

  try {
    const result = parseJSON(text) as { ready: boolean; questions?: FollowUpQuestion[] }
    return result
  } catch {
    return { ready: true }
  }
}

// ─── Plan generation ─────────────────────────────────────────────────────────

function buildPrompt(
  config: PlanConfig,
  existingPlan: DayPlan[],
  answers: WizardAnswers,
  followUpAnswers: Record<string, string>,
  followUpQuestions: FollowUpQuestion[],
): string {
  const numDays = config.numDays ?? 7
  const baseDays = emptyPlan(config)
  const days = baseDays.map((base, i) => existingPlan[i] ? { ...base, sessions: existingPlan[i].sessions } : base)
  const focusSport = config.sports.find(s => s.id === config.focus)
  const aiDecides = answers.setupMode === 'ai-decides'

  const sportLines = config.sports.map(sport => {
    const t = config.targets[sport.id]
    if (!t) return null
    const sess = t.sessionsPerWeek === 'auto' ? 'auto' : t.sessionsPerWeek
    const mins = t.minutesPerWeek ? `, ~${t.minutesPerWeek}min/week` : ''
    const intens = t.intensity ? `, intensity: ${t.intensity}` : ''
    return `  - ${sport.name} (id: "${sport.id}"): ${sess} sessions/week${mins}${intens}`
  }).filter(Boolean).join('\n')

  const dayLines = days.map((day, i) => {
    const pref = config.preferredStartTimes?.[i]
    const locked = day.sessions.filter(s => s.locked)
    const lockedMin = locked.reduce((sum, s) => sum + s.durationMin, 0)
    const remaining = Math.max(0, day.availableMin - lockedMin)

    if (day.availableMin === 0) return `  - ${day.day} ${day.date}: REST DAY — empty sessions array`

    const lockedDetail = locked.length > 0
      ? ` (${lockedMin}min locked: ${locked.map(s => {
          const sp = config.sports.find(sp => sp.id === s.sportId)
          return `${sp?.name ?? s.sportId} ${s.zone} ${s.durationMin}min`
        }).join(' + ')})`
      : ''

    const timeNote = aiDecides
      ? ` — budget up to ${day.availableMin}min, do not exceed`
      : ` — fill with ${remaining}min of sessions`

    return `  - ${day.day} ${day.date}:${pref ? ` preferred start ${pref},` : ''}${timeNote}${lockedDetail}`
  }).join('\n')

  const lockedContextLines = days.flatMap(day =>
    day.sessions.filter(s => s.locked).map(s => {
      const sp = config.sports.find(sp => sp.id === s.sportId)
      return `  - ${day.day}: ${sp?.name ?? s.sportId} ${s.zone} ${s.durationMin}min [LOCKED — do not include in output]`
    })
  )

  const followUpContext = followUpQuestions.length > 0
    ? followUpQuestions.map(q => `  - ${q.question}: ${followUpAnswers[q.id] ?? 'not answered'}`).join('\n')
    : ''

  const levelDescriptions: Record<string, string> = {
    beginner: 'New to training — keep intensity low, prioritise consistency over volume',
    intermediate: 'Regular trainer — can handle moderate load with some harder sessions',
    advanced: 'Experienced — periodised training, can sustain high load with proper recovery',
    elite: 'High-performance athlete — sophisticated periodisation, maximal training stimulus',
  }

  return `You are an expert sports coach generating a personalised weekly training plan.

ATHLETE PROFILE:
  Goal: "${answers.purpose}"
  Level: ${answers.level} — ${levelDescriptions[answers.level]}${answers.levelNote ? ` (note: ${answers.levelNote})` : ''}
  Weak areas / focus: ${answers.weaknesses.length ? answers.weaknesses.join(', ') : 'none specified'}${answers.weaknessNote ? ` — "${answers.weaknessNote}"` : ''}
  Injuries / physical constraints: ${answers.injuries.trim() || 'none reported'}
${followUpContext ? `  Additional context:\n${followUpContext}` : ''}
SCHEDULE MODE: ${aiDecides
    ? 'AI REDISTRIBUTES — you decide how to allocate sessions within each day\'s budget. Prioritise session quality over filling time. You can leave days partially filled.'
    : 'FIXED SETUP — fill each day\'s remaining time budget with appropriate sessions.'}

WEEK: ${numDays} days starting ${config.weekStartDate}
FOCUS SPORT: ${focusSport?.name ?? config.focus} — this sport gets the most attention and harder zones
OVERALL INTENSITY: ${config.weekIntensity}

SPORTS & WEEKLY TARGETS:
${sportLines}

DAILY SCHEDULE:
${dayLines}
${lockedContextLines.length > 0 ? `
LOCKED SESSIONS (do NOT include in output — added automatically):
${lockedContextLines.join('\n')}
` : ''}
INTENSITY ZONES:
  "recovery"  → Very easy, active recovery only
  "easy"      → Comfortable aerobic, full conversation
  "moderate"  → Steady/tempo, short sentences only
  "hard"      → Threshold or intervals, barely speaking
  "flat out"  → Maximum effort, VO2max or sprint

COACHING PRINCIPLES for this athlete:
${answers.level === 'beginner' ? '  - Keep 80%+ of sessions easy or recovery. One moderate session maximum per week.' : ''}
${answers.level === 'intermediate' ? '  - 70/30 easy-hard ratio. One key hard session, rest easy or moderate.' : ''}
${answers.level === 'advanced' || answers.level === 'elite' ? '  - Polarised training: most sessions easy, 1-2 genuinely hard sessions, avoid "moderate junk miles".' : ''}
${answers.purpose.toLowerCase().includes('race') || answers.purpose.toLowerCase().includes('event') || answers.purpose.toLowerCase().includes('compet') ? '  - Race-focused: include race-specific intensity (sport-specific hard sessions). Protect the key session.' : ''}
${answers.weaknesses.includes('Endurance') ? '  - Endurance focus: longer easy sessions, minimal stopping, time on feet/water/bike.' : ''}
${answers.weaknesses.includes('Speed') ? '  - Speed focus: include short sharp intervals in focus sport (hard or flat out zone).' : ''}
${answers.weaknesses.includes('Strength') ? '  - Strength focus: include gym/strength sessions, don\'t skip even if other sports are busy.' : ''}
${answers.injuries.trim() ? `  - INJURY CONSTRAINT: "${answers.injuries.trim()}" — avoid or modify sessions that aggravate this. Substitute with compatible sports or reduce load on affected days.` : ''}  - Never schedule back-to-back hard or flat-out sessions
  - Follow hard sessions with easy or recovery next day
  - Focus sport gets priority scheduling on best days

OUTPUT: Raw JSON array only — no markdown, no explanation.
Return exactly ${numDays} day objects. Each day has "day", "date", "availableMin", "sessions".
Each session: { "id": "7chars", "sportId": "...", "zone": "...", "durationMin": N, "startTime": "HH:MM" (optional) }
Valid sportIds: ${config.sports.map(s => `"${s.id}"`).join(', ')}
Valid zones: "recovery", "easy", "moderate", "hard", "flat out"
Do NOT include locked sessions. Do NOT exceed daily availableMin.`
}

function parseAndValidate(input: unknown[], config: PlanConfig, existingPlan: DayPlan[]): DayPlan[] {
  const numDays = config.numDays ?? 7
  if (input.length !== numDays) throw new Error(`Expected ${numDays} days, got ${input.length}`)

  const validIds = new Set(config.sports.map(s => s.id))

  return (input as Record<string, unknown>[]).map((day, i) => {
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
  answers: WizardAnswers,
  followUpAnswers: Record<string, string>,
  followUpQuestions: FollowUpQuestion[],
): Promise<DayPlan[]> {
  const prompt = buildPrompt(config, existingPlan, answers, followUpAnswers, followUpQuestions)

  const text = await callGroq([
    { role: 'system', content: 'You are an expert sports coach. Output only raw JSON — no markdown, no explanation.' },
    { role: 'user', content: prompt },
  ], 0.3)

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const raw = JSON.parse(cleaned)
  const planArray: unknown[] = Array.isArray(raw)
    ? raw
    : (raw.days ?? raw.plan ?? raw.schedule ?? raw.week ?? Object.values(raw as Record<string, unknown>).find(v => Array.isArray(v))) as unknown[]

  if (!Array.isArray(planArray) || planArray.length === 0) throw new Error('AI returned unexpected JSON shape — try again')

  return parseAndValidate(planArray, config, existingPlan)
}
