import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../lib/api'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

let turnstileScript: Promise<void> | null = null
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  if (turnstileScript) return turnstileScript
  turnstileScript = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      turnstileScript = null
      reject(new Error('Bot protection failed to load.'))
    }
    document.head.append(script)
  })
  return turnstileScript
}

export function BotChallenge({ action, onChange }: { action: 'register' | 'checkout'; onChange: (token: string | null, required: boolean) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onChange)
  const [siteKey, setSiteKey] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState(false)
  callback.current = onChange

  useEffect(() => {
    let active = true
    apiRequest<{ botProtection: { enabled: boolean; siteKey: string | null } }>('/api/config')
      .then(({ botProtection }) => {
        if (!active) return
        setSiteKey(botProtection.enabled ? botProtection.siteKey : null)
        callback.current(null, botProtection.enabled)
      })
      .catch(() => { if (active) callback.current(null, true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!siteKey || !container.current) return
    let widgetId: string | undefined
    let cancelled = false
    setLoadError(false)
    loadTurnstile().then(() => {
      if (cancelled || !container.current) return
      if (!window.turnstile) {
        turnstileScript = null
        setLoadError(true)
        callback.current(null, true)
        return
      }
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        action,
        theme: 'dark',
        callback: (token: string) => callback.current(token, true),
        'expired-callback': () => callback.current(null, true),
        'error-callback': () => { setLoadError(true); callback.current(null, true) },
      })
    }).catch(() => {
      if (cancelled) return
      setLoadError(true)
      callback.current(null, true)
    })
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [action, loadAttempt, siteKey])

  if (!siteKey) return null
  return <div className="bot-challenge-shell" aria-live="polite">
    <div className="bot-challenge" ref={container} aria-label="Ochrana proti automatům" />
    {loadError && <button className="text-button bot-challenge-retry" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>OCHRANU SE NEPODAŘILO NAČÍST — ZKUSIT ZNOVU</button>}
  </div>
}
