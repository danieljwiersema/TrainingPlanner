import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventDropArg, EventInput } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import type { DayPlan, PlanConfig } from '../lib/types'
import { type SyncStatus, type GCalState } from '../hooks/useGoogleCalendar'
import { type GCalEvent, type SyncResult } from '../lib/googleAuth'
import { GoogleConnect } from './GoogleConnect'

interface Props {
  plan: DayPlan[]
  config: PlanConfig
  onChange: (plan: DayPlan[]) => void
  gcal: GCalState
}

// ─── Event conversion ─────────────────────────────────────────────────────────

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const t = h * 60 + m + minutes
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

function isoToTime(iso: string): string { return iso.slice(11, 16) }
function isoToDate(iso: string): string { return iso.slice(0, 10) }

function planToEvents(plan: DayPlan[], config: PlanConfig): EventInput[] {
  return plan.flatMap(day =>
    day.sessions.map(session => {
      const sport = config.sports.find(s => s.id === session.sportId)
      const startTime = session.startTime ?? '07:00'
      return {
        id: session.id,
        title: `${sport?.icon ?? ''} ${session.label}`,
        start: `${day.date}T${startTime}`,
        end:   `${day.date}T${addMinutesToTime(startTime, session.durationMin)}`,
        backgroundColor: sport?.color ?? '#6b7280',
        borderColor: sport?.color ?? '#6b7280',
        textColor: '#fff',
        editable: true,
        extendedProps: { sessionId: session.id, isGCal: false },
      }
    })
  )
}

function gcalToEvents(events: GCalEvent[]): EventInput[] {
  return events.map(e => ({
    id: `gcal-${e.id}`,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
    textColor: '#6b7280',
    editable: false,
    extendedProps: { isGCal: true },
  }))
}

// ─── Sync status badge ────────────────────────────────────────────────────────

function SyncBadge({ status, result, error, onSync }: {
  status: SyncStatus
  result: SyncResult | null
  error: string | null
  onSync: () => void
}) {
  if (status === 'syncing') {
    return (
      <button disabled className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 text-sm font-semibold rounded-xl opacity-80 cursor-not-allowed">
        <span className="animate-spin">⏳</span> Syncing…
      </button>
    )
  }
  if (status === 'done' && result) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <span>✓</span>
          <span>{result.created} session{result.created !== 1 ? 's' : ''} pushed to <strong>🏋️ Training Plan</strong></span>
        </div>
        <button onClick={onSync} className="text-xs text-gray-400 hover:text-gray-600 underline">Re-sync</button>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
        <button onClick={onSync} className="text-xs text-gray-400 hover:text-gray-600 underline">Retry</button>
      </div>
    )
  }
  return (
    <button
      onClick={onSync}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
    >
      <span>📤</span> Push to Google Calendar
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CalendarView({ plan, config, onChange, gcal }: Props) {
  const calendarRef = useRef<FullCalendar>(null)

  function handleEventDrop(info: EventDropArg) {
    const { event } = info
    if (event.extendedProps.isGCal) { info.revert(); return }

    const sessionId = event.extendedProps.sessionId as string
    const newDate = isoToDate(event.startStr)
    const newTime = isoToTime(event.startStr)

    const next = plan.map(d => ({ ...d, sessions: [...d.sessions] }))
    let moved = null
    for (const day of next) {
      const idx = day.sessions.findIndex(s => s.id === sessionId)
      if (idx >= 0) {
        moved = { ...day.sessions[idx], startTime: newTime, userEdited: true }
        day.sessions.splice(idx, 1)
        break
      }
    }
    if (!moved) { info.revert(); return }
    const target = next.find(d => d.date === newDate)
    if (!target) { info.revert(); return }
    target.sessions.push(moved)
    onChange(next)
  }

  function handleEventResize(info: EventResizeDoneArg) {
    const { event } = info
    if (event.extendedProps.isGCal) { info.revert(); return }

    const sessionId = event.extendedProps.sessionId as string
    const durationMin = Math.round(
      (new Date(event.endStr).getTime() - new Date(event.startStr).getTime()) / 60000
    )
    onChange(plan.map(d => ({
      ...d,
      sessions: d.sessions.map(s => s.id === sessionId ? { ...s, durationMin, userEdited: true } : s),
    })))
  }

  const allEvents: EventInput[] = [
    ...planToEvents(plan, config),
    ...gcalToEvents(gcal.gcalEvents),
  ]

  const missingSessions = plan.some(d => d.sessions.some(s => !s.startTime))

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">📅</span>
              <h2 className="text-sm font-bold text-gray-700">Google Calendar</h2>
              {gcal.loadingGCal && <span className="text-xs text-gray-400 animate-pulse">Loading…</span>}
              {gcal.gcalError && <span className="text-xs text-red-500">{gcal.gcalError}</span>}
            </div>
            <GoogleConnect
              clientId={gcal.clientId}
              onClientIdChange={gcal.setClientId}
              onConnected={gcal.connect}
              onDisconnect={gcal.disconnect}
              connected={!!gcal.token}
            />
          </div>

          {gcal.token && (
            <div className="flex flex-col items-end gap-1">
              <SyncBadge
                status={gcal.syncStatus}
                result={gcal.syncResult}
                error={gcal.syncError}
                onSync={gcal.sync}
              />
              {missingSessions && gcal.syncStatus !== 'done' && (
                <p className="text-xs text-gray-400 text-right max-w-xs">
                  Sessions without a time will be pushed at 07:00 — set times below first for best results.
                </p>
              )}
              {gcal.syncStatus === 'done' && (
                <p className="text-xs text-gray-400 text-right">
                  Toggle the calendar on/off from the Google Calendar sidebar under "Other calendars".
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-5 text-xs text-gray-400 px-1 flex-wrap">
        {config.sports.map(s => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5 ml-2">
          <span className="w-2.5 h-2.5 rounded-sm inline-block bg-gray-200" />
          Your calendar (read-only)
        </span>
        <span className="ml-auto text-gray-300">Drag to move · Resize bottom edge to change duration</span>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          initialDate={config.weekStartDate}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={allEvents}
          editable={true}
          droppable={false}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          firstDay={1}
          slotMinTime="05:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={true}
          nowIndicator={true}
          height="100%"
          eventClassNames={info => info.event.extendedProps.isGCal ? ['fc-gcal-event'] : ['fc-training-event']}
        />
      </div>
    </div>
  )
}
