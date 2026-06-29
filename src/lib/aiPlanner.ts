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
  constraints: string
  setupMode: 'current' | 'ai-modality' | 'ai-decides'
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
  const totalWeeklyMin = config.dailyMinutes.reduce((a, b) => a + b, 0)

  const prompt = `You are preparing to generate a personalised training plan. Review the athlete's answers and decide if 1–2 more targeted questions would significantly improve the plan.

ATHLETE ANSWERS:
  Purpose: "${answers.purpose}"
  Level: ${answers.level}${answers.levelNote ? ` — "${answers.levelNote}"` : ''}
  Weak areas: ${answers.weaknesses.length ? answers.weaknesses.join(', ') : 'none'}${answers.weaknessNote ? ` — "${answers.weaknessNote}"` : ''}
  Injuries: ${answers.injuries.trim() || 'none'}
  Constraints: ${answers.constraints.trim() || 'none'}
  Setup: ${answers.setupMode}

SETUP:
  Sports: ${config.sports.map(s => s.name).join(', ')}
  Focus: ${focusSport?.name ?? config.focus}
  Intensity: ${config.weekIntensity}
  Weekly time: ${totalWeeklyMin}min over ${config.numDays ?? 7} days

Only ask follow-ups if the purpose mentions a specific event (ask timeframe/demands) or weaknesses are too vague to act on.
Do NOT ask about things already known from their setup.
Max 2 questions. If in doubt, proceed.

Respond with raw JSON only:
{ "ready": true }
OR
{ "ready": false, "questions": [{ "id": "q1", "question": "...", "type": "select", "options": ["..."] }] }`

  const text = await callGroq([
    { role: 'system', content: 'You are a sports coach assistant. Respond with raw JSON only, no markdown.' },
    { role: 'user', content: prompt },
  ], 0.2)

  try {
    return parseJSON(text) as { ready: boolean; questions?: FollowUpQuestion[] }
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
  const aiModality = answers.setupMode === 'ai-modality'

  // Hard constraints — listed explicitly so the model treats them as inviolable
  const hardConstraints: string[] = []
  if (answers.injuries.trim())
    hardConstraints.push(`INJURY: "${answers.injuries.trim()}" — do NOT schedule sessions that could aggravate this. Substitute with other sports or reduce intensity.`)
  if (answers.constraints.trim())
    hardConstraints.push(`SCHEDULING RULE: "${answers.constraints.trim()}" — follow this exactly, without exception.`)
  hardConstraints.push('NEVER exceed the daily availableMin time budget on any day')
  hardConstraints.push('NEVER include locked sessions in output (they are added automatically)')
  hardConstraints.push('NEVER schedule hard or flat-out sessions on two consecutive days')

  const sportLines = config.sports.map(sport => {
    const t = config.targets[sport.id]
    if (!t) return null
    if (aiModality || aiDecides) {
      return `  - ${sport.name} (sportId: "${sport.id}")`
    }
    const sess = t.sessionsPerWeek === 'auto' ? 'auto' : t.sessionsPerWeek
    const mins = t.minutesPerWeek ? `, ~${t.minutesPerWeek}min/week` : ''
    const intens = t.intensity ? `, intensity: ${t.intensity}` : ''
    return `  - ${sport.name} (sportId: "${sport.id}"): ${sess} sessions/week${mins}${intens}`
  }).filter(Boolean).join('\n')

  const dayLines = days.map((day, i) => {
    const pref = config.preferredStartTimes?.[i]
    const locked = day.sessions.filter(s => s.locked)
    const lockedMin = locked.reduce((sum, s) => sum + s.durationMin, 0)
    const remaining = Math.max(0, day.availableMin - lockedMin)
    if (day.availableMin === 0) return `  ${day.day} ${day.date}: REST DAY → sessions: []`
    const lockedNote = locked.length > 0
      ? ` [${lockedMin}min already locked: ${locked.map(s => {
          const sp = config.sports.find(sp => sp.id === s.sportId)
          return `${sp?.name ?? s.sportId} ${s.durationMin}min`
        }).join(' + ')}]`
      : ''
    const budget = (aiDecides || aiModality)
      ? `budget MAX ${day.availableMin}min`
      : `fill ${remaining}min`
    return `  ${day.day} ${day.date}: ${budget}${pref ? ` start:${pref}` : ''}${lockedNote}`
  }).join('\n')

  const lockedContextLines = days.flatMap(day =>
    day.sessions.filter(s => s.locked).map(s => {
      const sp = config.sports.find(sp => sp.id === s.sportId)
      return `  ${day.day}: ${sp?.name ?? s.sportId} ${s.zone} ${s.durationMin}min — LOCKED, do not output`
    })
  )

  const followUpContext = followUpQuestions
    .filter(q => followUpAnswers[q.id])
    .map(q => `  ${q.question}: ${followUpAnswers[q.id]}`)
    .join('\n')

  const levelGuidance: Record<string, string> = {
    beginner:     'BEGINNER: Keep 80%+ sessions easy/recovery. Max 1 moderate per week. No hard/flat-out.',
    intermediate: 'INTERMEDIATE: 70% easy, 30% harder. One key hard session per week maximum.',
    advanced:     'ADVANCED: Polarised — mostly easy with 1-2 genuinely hard sessions. Avoid moderate junk miles.',
    elite:        'ELITE: Sophisticated periodisation. Maximal training stimulus with full recovery days.',
  }

  const modeDescription = aiDecides
    ? 'AI DECIDES — choose sports, session counts, and durations freely. Stay within daily budgets. Prioritise quality over filling time completely.'
    : aiModality
      ? 'AI CHOOSES SPORTS — daily time budgets are fixed. You decide which sports and how many sessions based on the athlete\'s goal. Ignore session count targets.'
      : 'FIXED SETUP — respect session count targets. Fill each day\'s remaining budget.'

  const exampleDate = days[0]?.date ?? 'YYYY-MM-DD'
  const exampleSport = config.sports[0]?.id ?? 'run'

  return `You are an expert sports coach. Generate a weekly training plan as a raw JSON array.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD CONSTRAINTS — NEVER VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hardConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ATHLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Goal: "${answers.purpose}"
${levelGuidance[answers.level]}${answers.levelNote ? `\nNote: "${answers.levelNote}"` : ''}
Weaknesses: ${answers.weaknesses.length ? answers.weaknesses.join(', ') : 'none'}${answers.weaknessNote ? ` — "${answers.weaknessNote}"` : ''}
${followUpContext ? `Extra context:\n${followUpContext}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEDULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: ${modeDescription}
Week: ${numDays} days from ${config.weekStartDate}
Focus sport: ${focusSport?.name ?? config.focus} — give this sport priority and harder zones
Intensity: ${config.weekIntensity}

Available sports:
${sportLines}

Daily time budgets:
${dayLines}
${lockedContextLines.length > 0 ? `\nLocked sessions (DO NOT include in output):\n${lockedContextLines.join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COACHING GUIDELINES (follow if no conflict with hard constraints)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Focus sport gets most sessions and hardest zones
- Day after a hard session must be easy or recovery
- Avoid same sport on consecutive days unless required
${answers.purpose.toLowerCase().match(/race|event|compet|tri|marathon|5k|10k|row/) ? '- Race prep: include at least 1 sport-specific hard session\n' : ''}${answers.weaknesses.includes('Endurance') ? '- Endurance: longer easy sessions, maximise time in aerobic zone\n' : ''}${answers.weaknesses.includes('Speed') ? '- Speed: include short sharp intervals in focus sport (hard/flat out)\n' : ''}${answers.weaknesses.includes('Strength') ? '- Strength: always schedule a strength/gym session\n' : ''}
INTENSITY ZONES (use exact strings):
"recovery" = very easy active recovery
"easy"     = comfortable aerobic, full conversation
"moderate" = steady/tempo, short sentences
"hard"     = threshold/intervals, barely speaking
"flat out" = maximum effort, VO2max/sprint

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — raw JSON array only, nothing else
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[{"day":"Mon","date":"${exampleDate}","availableMin":60,"sessions":[{"id":"a1b2c3d","sportId":"${exampleSport}","zone":"easy","durationMin":45}]},...${numDays - 1} more days]

Rules:
- Exactly ${numDays} elements in the array
- Valid sportId values: ${config.sports.map(s => `"${s.id}"`).join(', ')}
- Valid zone values: "recovery", "easy", "moderate", "hard", "flat out"
- id: unique 7-char alphanumeric string per session
- startTime: optional "HH:MM", only include if a preferred start time was specified
- Days with 0min budget OR fully locked days: sessions must be []`
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
    { role: 'system', content: 'You are an expert sports coach. Output ONLY a raw JSON array — no markdown, no explanation, no text before or after the [.' },
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
