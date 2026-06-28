import type { DayPlan, PlanConfig, Session } from './types'

export interface GCalEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
}

export interface SyncResult {
  created: number
}

const GCAL_API = 'https://www.googleapis.com/calendar/v3'
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar'

// ─── Google Identity Services (GIS) ──────────────────────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
          }): { requestAccessToken(): void }
        }
      }
    }
  }
}

function loadGIS(): Promise<void> {
  return new Promise(resolve => {
    if (window.google?.accounts) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
}

export async function requestGoogleToken(clientId: string): Promise<string> {
  await loadGIS()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GCAL_SCOPE,
      callback: response => {
        if (response.error) reject(new Error(response.error))
        else if (response.access_token) resolve(response.access_token)
        else reject(new Error('No token received'))
      },
    })
    client.requestAccessToken()
  })
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(token: string, path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${GCAL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GCal API ${res.status}: ${body}`)
  }
  return res
}

export async function getOrCreateTrainingCalendar(token: string): Promise<string> {
  const listRes = await apiFetch(token, '/users/me/calendarList')
  const list = await listRes.json() as { items: { id: string; summary: string }[] }
  const existing = list.items.find(c => c.summary === '🏋️ Training Plan')
  if (existing) return existing.id

  const createRes = await apiFetch(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: '🏋️ Training Plan' }),
  })
  const created = await createRes.json() as { id: string }
  return created.id
}

export async function fetchCalendarEvents(token: string, weekStartDate: string): Promise<GCalEvent[]> {
  const start = new Date(weekStartDate + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })

  // Get all calendars the user has access to
  const listRes = await apiFetch(token, '/users/me/calendarList')
  const list = await listRes.json() as { items: { id: string; accessRole: string }[] }
  const calendarIds = list.items
    .filter(c => c.accessRole === 'owner' || c.accessRole === 'writer' || c.accessRole === 'reader')
    .map(c => c.id)

  const allEvents: GCalEvent[] = []
  await Promise.all(calendarIds.map(async calId => {
    try {
      const res = await apiFetch(token, `/calendars/${encodeURIComponent(calId)}/events?${params}`)
      const data = await res.json() as {
        items: { id: string; summary: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }[]
      }
      for (const e of data.items ?? []) {
        allEvents.push({
          id: `${calId}::${e.id}`,
          title: e.summary ?? '(no title)',
          start: e.start.dateTime ?? e.start.date ?? '',
          end: e.end.dateTime ?? e.end.date ?? '',
          allDay: !e.start.dateTime,
        })
      }
    } catch {
      // skip calendars we can't read
    }
  }))

  return allEvents
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function pushSession(token: string, calId: string, session: Session, isoDate: string): Promise<void> {
  const start = session.startTime ?? '07:00'
  const end = addMinutes(start, session.durationMin)
  await apiFetch(token, `/calendars/${encodeURIComponent(calId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: session.label,
      start: { dateTime: `${isoDate}T${start}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end:   { dateTime: `${isoDate}T${end}:00`,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    }),
  })
}

export async function syncTrainingWeek(
  token: string,
  calId: string,
  plan: DayPlan[],
  _config: PlanConfig,
): Promise<SyncResult> {
  let created = 0
  for (const day of plan) {
    for (const session of day.sessions) {
      await pushSession(token, calId, session, day.date)
      created++
    }
  }
  return { created }
}
