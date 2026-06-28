import type { DayPlan, Session } from '../lib/types'

export function usePlanEditor(plan: DayPlan[], onChange: (plan: DayPlan[]) => void) {
  function moveSession(sessionId: string, fromDayIndex: number, toDayIndex: number) {
    if (toDayIndex === fromDayIndex) return
    const next = plan.map(d => ({ ...d, sessions: [...d.sessions] }))
    const session = next[fromDayIndex].sessions.find(s => s.id === sessionId)
    if (!session || session.locked) return
    next[fromDayIndex].sessions = next[fromDayIndex].sessions.filter(s => s.id !== sessionId)
    next[toDayIndex].sessions.push({ ...session, userEdited: true })
    onChange(next)
  }

  function saveSession(dayIndex: number, session: Session) {
    const next = plan.map(d => ({ ...d, sessions: [...d.sessions] }))
    const idx = next[dayIndex].sessions.findIndex(s => s.id === session.id)
    if (idx >= 0) next[dayIndex].sessions[idx] = session
    else next[dayIndex].sessions.push(session)
    onChange(next)
  }

  function deleteSession(sessionId: string) {
    onChange(plan.map(d => ({ ...d, sessions: d.sessions.filter(s => s.id !== sessionId) })))
  }

  function setSessionTime(sessionId: string, time: string | undefined) {
    onChange(plan.map(d => ({
      ...d,
      sessions: d.sessions.map(s => s.id === sessionId ? { ...s, startTime: time } : s),
    })))
  }

  function toggleLock(sessionId: string) {
    onChange(plan.map(d => ({
      ...d,
      sessions: d.sessions.map(s => s.id === sessionId ? { ...s, locked: !s.locked } : s),
    })))
  }

  function clearUnlocked() {
    onChange(plan.map(d => ({ ...d, sessions: d.sessions.filter(s => s.locked) })))
  }

  function clearAll() {
    onChange(plan.map(d => ({ ...d, sessions: [] })))
  }

  return { moveSession, saveSession, deleteSession, setSessionTime, toggleLock, clearUnlocked, clearAll }
}
