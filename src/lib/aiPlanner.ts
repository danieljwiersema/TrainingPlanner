import type { DayPlan, PlanConfig, Zone } from './types'

export interface SessionOption {
  zone: Zone
  notes: string
  pro: string
  zoneDiff: 'same' | 'up' | 'down'
}

export interface SessionDesign {
  sessionId: string
  options: SessionOption[]
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

const VALID_ZONES = new Set<Zone>(['recovery', 'easy', 'moderate', 'hard', 'flat out'])

export interface CoachAnswers {
  mode: 'intensity' | 'design'
  goal: string
  hardTolerance: 1 | 2 | 3 | 'max' | 'auto'
  hardSports: string[]   // sportIds that should receive hard sessions
  weaknesses: string[]
  injuries?: string
}

export interface SessionChange {
  id: string
  zone: Zone
  notes?: string
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

// Strip markdown fences and parse JSON with a friendly error on failure
function safeParseJSON(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error("AI response wasn't valid — please try again")
  }
}

function buildOptimisePrompt(config: PlanConfig, plan: DayPlan[], answers: CoachAnswers): string {
  const focusSport = config.sports.find(s => s.id === config.focus)
  const hardSportNames = answers.hardSports
    .map(id => config.sports.find(s => s.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  const toleranceLabel = answers.hardTolerance === 'auto'
    ? "you decide the appropriate number of hard sessions for this athlete's level and goal (be conservative — when unsure, fewer is safer)"
    : answers.hardTolerance === 'max'
      ? 'as many hard sessions as the week can support'
      : `exactly ${answers.hardTolerance} hard or flat-out session${answers.hardTolerance > 1 ? 's' : ''} across the whole week`

  // Editable sessions (unlocked) vs locked sessions (read-only context)
  const editableLines: string[] = []
  const lockedLines: string[] = []
  for (const day of plan) {
    for (const session of day.sessions) {
      const sport = config.sports.find(s => s.id === session.sportId)
      const line = `  id:"${session.id}" | ${day.day} ${day.date} | ${sport?.name ?? session.sportId} | ${session.durationMin}min | zone: ${session.zone}`
      if (session.locked) lockedLines.push(line)
      else editableLines.push(line)
    }
  }

  const designMode = answers.mode === 'design'
  const injuriesLine = answers.injuries?.trim()
    ? `\nINJURIES / LIMITATIONS (HARD CONSTRAINT): ${answers.injuries.trim()} — never prescribe intensity that could aggravate this.`
    : ''

  const strengthSports = config.sports.filter(s => s.kind === 'strength')
  const strengthNote = strengthSports.length
    ? `\nSTRENGTH SPORTS (${strengthSports.map(s => s.name).join(', ')}): treat intensity as LOAD / RPE, not heart-rate. Map zones → recovery=mobility, easy=technique (RPE 4-5), moderate=working sets (RPE 6-7), hard=heavy (RPE 8-9), flat out=max/PR (RPE 10). Write notes as sets×reps with %1RM or RPE, e.g. "5×5 back squat @ 80% 1RM, 3min rest".`
    : ''

  return `You are an expert endurance and multisport coach. Your task is to assign intensity zones${designMode ? ' and write specific workout notes' : ''} for each session in an athlete's weekly training plan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ATHLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Goal: "${answers.goal}"
Weaknesses: ${answers.weaknesses.length ? answers.weaknesses.join(', ') : 'none stated'}
Focus sport: ${focusSport?.name ?? config.focus}${injuriesLine}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTENSITY RULES — FOLLOW EXACTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Hard session budget: ${toleranceLabel}
2. Hard sessions ONLY in: ${hardSportNames || 'any sport'}
3. NEVER assign hard or flat-out to any other sport
4. NEVER place hard/flat-out on consecutive days
5. The day AFTER a hard session must be easy or recovery
6. Fill remaining sessions with easy or recovery (no unnecessary moderate)
7. Only return entries for the EDITABLE sessions below. Do NOT output locked sessions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTENSITY ZONES (use exact strings)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"recovery" — very easy, active recovery, HR zone 1
"easy"     — comfortable aerobic, full conversation, HR zone 2
"moderate" — steady/tempo effort, short sentences, HR zone 3
"hard"     — threshold/intervals, barely speaking, HR zone 4
"flat out" — maximum effort, VO2max or sprint, HR zone 5
${strengthNote}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDITABLE SESSIONS — assign zones to these
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${editableLines.join('\n') || '  (no editable sessions)'}
${lockedLines.length ? `\nLOCKED SESSIONS — context only, DO NOT modify or output:\n${lockedLines.join('\n')}\n` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${designMode ? 'TASK: Assign zone AND write a specific workout note for every session' : 'TASK: Assign zone only for every session'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${designMode
  ? `Notes must be specific and actionable — include sets/reps/distance/pace/HR targets where relevant.
Examples:
  run easy 45min: "45min easy run, HR below 140, conversational pace, no surges"
  run hard 60min: "10min warm-up, 5×6min @ threshold (1:1 rest), 10min cool-down"
  swim easy 45min: "1500m technique focus — drill sets: 4×50m catch-up, 4×50m fingertip drag, then 800m easy aerobic"
  row hard 50min: "10min warm-up, 6×500m @ 1:55/500m (r:90s), 10min cool-down"
  strength easy 60min: "Full body — 3×8 squat, 3×8 deadlift, 3×10 press, 2×12 pull-up, core circuit"
  bike recovery 45min: "Easy spin, flat route or trainer, HR below 120, rate 85-90rpm, no efforts"
`
  : ''}
OUTPUT: Raw JSON only, no markdown, no explanation.
{ "sessions": [
  { "id": "SESSION_ID", "zone": "easy"${designMode ? ', "notes": "..."' : ''} },
  ...one entry per session above
] }`
}

const ZONE_ORDER: Zone[] = ['recovery', 'easy', 'moderate', 'hard', 'flat out']

function zoneDiff(current: Zone, proposed: Zone): 'same' | 'up' | 'down' {
  const ci = ZONE_ORDER.indexOf(current)
  const pi = ZONE_ORDER.indexOf(proposed)
  if (pi > ci) return 'up'
  if (pi < ci) return 'down'
  return 'same'
}

export async function designSessions(
  config: PlanConfig,
  plan: DayPlan[],
  selectedIds: string[],
  injuries?: string,
): Promise<SessionDesign[]> {
  const allSessions = plan.flatMap(d => d.sessions)
  const selected = allSessions.filter(s => selectedIds.includes(s.id) && !s.locked)
  if (selected.length === 0) throw new Error('No editable sessions selected (locked sessions are skipped)')

  const sessionLines = selected.map(s => {
    const day = plan.find(d => d.sessions.some(ss => ss.id === s.id))
    const sport = config.sports.find(sp => sp.id === s.sportId)
    return `  id:"${s.id}" | ${day?.day ?? ''} | ${sport?.name ?? s.sportId} | ${s.durationMin}min | current zone: ${s.zone}`
  }).join('\n')

  const injuriesLine = injuries?.trim()
    ? `\nINJURIES / LIMITATIONS (HARD CONSTRAINT): ${injuries.trim()} — never prescribe a workout that could aggravate this.\n`
    : ''

  const prompt = `You are an expert multisport coach. For each session below, provide exactly 2–3 workout options.

SESSIONS TO DESIGN:
${sessionLines}
${injuriesLine}
RULES:
- Options must be centred around the session's current zone — you may go one step harder OR one step easier, but no more
- Each option must fit within the session's duration
- Notes must be specific and actionable (sets, reps, distances, paces, HR targets)
- Pro must be 1 short sentence explaining the benefit
- Cover a range of approaches — don't give 3 identical options

INTENSITY ZONES:
"recovery" — zone 1, very easy active recovery
"easy"     — zone 2, comfortable aerobic, conversational
"moderate" — zone 3, steady/tempo, short sentences
"hard"     — zone 4, threshold/intervals, barely speaking
"flat out" — zone 5, VO2max or sprint
${config.sports.some(s => s.kind === 'strength')
  ? 'For strength sports, treat intensity as LOAD/RPE not heart-rate (easy=technique RPE4-5, moderate=working RPE6-7, hard=heavy RPE8-9, flat out=max RPE10) and write notes as sets×reps with %1RM or RPE.'
  : ''}

OUTPUT: raw JSON only
{
  "designs": [
    {
      "sessionId": "SESSION_ID",
      "options": [
        { "zone": "easy", "notes": "specific workout description", "pro": "one sentence benefit" },
        { "zone": "moderate", "notes": "specific workout description", "pro": "one sentence benefit" }
      ]
    }
  ]
}`

  const text = await callGroq([
    { role: 'system', content: 'You are an expert sports coach. Output ONLY raw JSON — no markdown, no explanation.' },
    { role: 'user', content: prompt },
  ], 0.5)

  const raw = safeParseJSON(text) as { designs?: unknown[] }
  const designs = raw.designs ?? (Array.isArray(raw) ? raw : null)
  if (!Array.isArray(designs)) throw new Error('AI returned unexpected shape — try again')

  return (designs as Record<string, unknown>[]).map(d => {
    const sessionId = d['sessionId'] as string
    const currentSession = selected.find(s => s.id === sessionId)
    const currentZone = currentSession?.zone ?? 'easy'
    const opts = (d['options'] as Record<string, unknown>[]) ?? []
    return {
      sessionId,
      options: opts.map(o => {
        const zone = VALID_ZONES.has(o['zone'] as Zone) ? (o['zone'] as Zone) : currentZone
        return {
          zone,
          notes: (o['notes'] as string) ?? '',
          pro: (o['pro'] as string) ?? '',
          zoneDiff: zoneDiff(currentZone, zone),
        }
      }),
    }
  })
}

export async function optimiseSessions(
  config: PlanConfig,
  plan: DayPlan[],
  answers: CoachAnswers,
): Promise<SessionChange[]> {
  const editable = plan.flatMap(d => d.sessions).filter(s => !s.locked)
  if (editable.length === 0) throw new Error('No editable sessions — generate a schedule first (locked sessions are left untouched)')

  const prompt = buildOptimisePrompt(config, plan, answers)

  const text = await callGroq([
    {
      role: 'system',
      content: 'You are an expert sports coach. Output ONLY raw JSON — no markdown fences, no explanation, nothing before or after the {.',
    },
    { role: 'user', content: prompt },
  ], 0.3)

  const raw = safeParseJSON(text) as { sessions?: unknown[] }
  const items = raw.sessions ?? (Array.isArray(raw) ? raw : null)
  if (!Array.isArray(items) || items.length === 0) throw new Error('AI returned unexpected shape — try again')

  // Only unlocked sessions may be changed
  const validIds = new Set(editable.map(s => s.id))

  return (items as Record<string, unknown>[])
    .filter(item => typeof item['id'] === 'string' && validIds.has(item['id'] as string))
    .map(item => {
      const zone = item['zone'] as string
      return {
        id: item['id'] as string,
        zone: VALID_ZONES.has(zone as Zone) ? (zone as Zone) : 'easy',
        notes: typeof item['notes'] === 'string' ? item['notes'] as string : undefined,
      }
    })
}
