import { useState, useEffect } from 'react'
import {
  fetchCalendarEvents,
  getOrCreateTrainingCalendar,
  syncTrainingWeek,
  type GCalEvent,
  type SyncResult,
} from '../lib/googleAuth'
import type { DayPlan, PlanConfig } from '../lib/types'

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error'
export type GCalState = ReturnType<typeof useGoogleCalendar>

export function useGoogleCalendar(plan: DayPlan[], config: PlanConfig) {
  const [clientId, setClientIdState] = useState(() => localStorage.getItem('gcal-client-id') ?? '')
  const [token, setToken] = useState<string | null>(null)
  const [gcalEvents, setGcalEvents] = useState<GCalEvent[]>([])
  const [loadingGCal, setLoadingGCal] = useState(false)
  const [gcalError, setGcalError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  function setClientId(id: string) {
    setClientIdState(id)
    localStorage.setItem('gcal-client-id', id)
  }

  useEffect(() => {
    if (!token) return
    setLoadingGCal(true)
    setGcalError(null)
    fetchCalendarEvents(token, config.weekStartDate)
      .then(setGcalEvents)
      .catch(e => {
        setGcalError((e as Error).message)
        if ((e as Error).message.includes('401')) setToken(null)
      })
      .finally(() => setLoadingGCal(false))
  }, [token, config.weekStartDate])

  useEffect(() => {
    setSyncStatus('idle')
    setSyncResult(null)
  }, [plan])

  function connect(t: string) {
    setToken(t)
    setGcalError(null)
  }

  function disconnect() {
    setToken(null)
    setGcalEvents([])
    setSyncStatus('idle')
  }

  async function sync() {
    if (!token) return
    setSyncStatus('syncing')
    setSyncError(null)
    try {
      const calId = await getOrCreateTrainingCalendar(token)
      const result = await syncTrainingWeek(token, calId, plan, config)
      setSyncResult(result)
      setSyncStatus('done')
      fetchCalendarEvents(token, config.weekStartDate).then(setGcalEvents).catch(() => {})
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed')
      setSyncStatus('error')
    }
  }

  return {
    clientId, setClientId,
    token, connect, disconnect,
    gcalEvents, loadingGCal, gcalError,
    syncStatus, syncResult, syncError, sync,
  }
}
