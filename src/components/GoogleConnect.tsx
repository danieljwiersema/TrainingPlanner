import { useState } from 'react'
import { requestGoogleToken } from '../lib/googleAuth'

interface Props {
  clientId: string
  onClientIdChange: (id: string) => void
  onConnected: (token: string) => void
  onDisconnect: () => void
  connected: boolean
}

export function GoogleConnect({ clientId, onClientIdChange, onConnected, onDisconnect, connected }: Props) {
  const [showClientIdInput, setShowClientIdInput] = useState(!clientId)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    if (!clientId.trim()) { setShowClientIdInput(true); return }
    setConnecting(true)
    setError(null)
    try {
      const token = await requestGoogleToken(clientId.trim())
      onConnected(token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  if (connected) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-green-700 font-medium flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Connected
        </span>
        <button
          onClick={onDisconnect}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {showClientIdInput ? (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500">
            Enter your Google OAuth 2.0 Client ID.{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              Get one here
            </a>
            {' '}(enable the Google Calendar API first).
          </p>
          <input
            type="text"
            placeholder="your-client-id.apps.googleusercontent.com"
            value={clientId}
            onChange={e => onClientIdChange(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowClientIdInput(true)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          {clientId ? 'Change client ID' : 'Set client ID'}
        </button>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleConnect}
        disabled={connecting || !clientId.trim()}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
      >
        {connecting ? (
          <span className="animate-spin text-base">⏳</span>
        ) : (
          <span className="text-base">🔑</span>
        )}
        {connecting ? 'Connecting…' : 'Connect Google Calendar'}
      </button>
    </div>
  )
}
