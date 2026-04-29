import { getWeekStart, MILLISECOND, DAY } from "$lib/time"
import { db } from "$lib/db"

const GCAL_API = "https://www.googleapis.com/calendar/v3"
const TOKEN_KEY = "gcal_access_token"
const TOKEN_EXPIRY_KEY = "gcal_token_expiry"
const CLIENT_ID_KEY = "gcal_client_id"
/** Refresh this many ms before the stored expiry to give the request time to complete. */
const PROACTIVE_REFRESH_BUFFER_MS = 5 * 60 * 1000
/** Cap the timer so it stays within the 32-bit setTimeout limit (~24.8 days). */
const MAX_TIMER_MS = 60 * 60 * 1000

let _tokenRefreshTimer: ReturnType<typeof setTimeout> | undefined

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string, expiresIn?: number) {
  localStorage.setItem(TOKEN_KEY, token)
  if (expiresIn != null) {
    // Store expiry with a 60-second buffer so we refresh before it actually expires
    const expiry = Date.now() + (expiresIn - 60) * 1000
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry))
  }
  scheduleTokenRefresh()
}

export function isTokenExpired(): boolean {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
  // If no expiry stored (e.g. token from before expiry tracking was added),
  // treat as expired so we attempt a silent refresh to get a fresh token.
  if (!expiry) return !!getAccessToken()
  return Date.now() > parseInt(expiry)
}

export function clearAccessToken() {
  if (_tokenRefreshTimer !== undefined) {
    clearTimeout(_tokenRefreshTimer)
    _tokenRefreshTimer = undefined
  }
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
  localStorage.removeItem(CLIENT_ID_KEY)
}

/**
 * Schedule a proactive silent token refresh just before the stored token expires.
 * Call this on page load (to bootstrap the cycle for existing tokens) and after
 * each token update (setAccessToken already does this automatically).
 * The cycle is self-perpetuating: each successful silent refresh calls setAccessToken,
 * which calls scheduleTokenRefresh again to queue the next refresh.
 */
export function scheduleTokenRefresh() {
  if (_tokenRefreshTimer !== undefined) {
    clearTimeout(_tokenRefreshTimer)
    _tokenRefreshTimer = undefined
  }
  if (!getAccessToken()) return
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
  if (!expiry) return
  const delay = Math.min(
    MAX_TIMER_MS,
    Math.max(0, parseInt(expiry) - Date.now() - PROACTIVE_REFRESH_BUFFER_MS),
  )
  _tokenRefreshTimer = setTimeout(async () => {
    _tokenRefreshTimer = undefined
    try {
      await silentlyRefreshToken()
    } catch (e) {
      console.warn("Proactive token refresh failed:", e)
    }
  }, delay)
}

export function setClientId(clientId: string) {
  localStorage.setItem(CLIENT_ID_KEY, clientId)
}

export function getClientId(): string | null {
  return localStorage.getItem(CLIENT_ID_KEY)
}

export function isConnected(): boolean {
  return !!getAccessToken()
}

/** Initiate Google OAuth2 token flow using Google Identity Services */
export function connectWithGoogle(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          setClientId(clientId)
          setAccessToken(response.access_token, response.expires_in)
          resolve(response.access_token)
        }
      },
    })
    client.requestAccessToken()
  })
}

/**
 * Silently refresh the access token using the stored client ID.
 * Uses prompt:"" so Google will not show any UI if the user already granted consent.
 */
export function silentlyRefreshToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = getClientId()
    if (!clientId) {
      reject(new Error("No client ID stored; cannot refresh token silently"))
      return
    }
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(`Token refresh failed: ${response.error}`))
          } else {
            setAccessToken(response.access_token, response.expires_in)
            resolve(response.access_token)
          }
        },
      })
      client.requestAccessToken({ prompt: "" })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Returns a valid access token, refreshing silently if the current one is expired.
 * Throws if not authenticated or if the silent refresh fails.
 */
export async function getValidToken(): Promise<string> {
  const token = getAccessToken()
  if (!token) throw new Error("Not authenticated with Google")
  if (!isTokenExpired()) return token
  return silentlyRefreshToken()
}

export async function getAllCalendars(): Promise<any[]> {
  const token = await getValidToken()

  const headers = { Authorization: `Bearer ${token}` }

  const calListRes = await fetch(`${GCAL_API}/users/me/calendarList`, { headers })
  if (!calListRes.ok) throw new Error(`Failed to fetch calendar list: ${calListRes.status}`)
  const calList = await calListRes.json()

  return calList.items
}

/** Returns all events happening this week from all calendars */
export async function getAllEvents(): Promise<any[]> {
  const token = await getValidToken()

  const weekStartMs = getWeekStart() / MILLISECOND
  const weekEndMs = weekStartMs + (7 * DAY) / MILLISECOND

  const timeMin = new Date(weekStartMs).toISOString()
  const timeMax = new Date(weekEndMs).toISOString()

  const headers = { Authorization: `Bearer ${token}` }
  const enabledCals = ((await db.metadata.get("enabledCals"))?.value as string[]) || []

  const eventArrays = await Promise.all(
    enabledCals.map(async (calId) => {
      const params = new URLSearchParams({ singleEvents: "true", timeMin, timeMax })
      const res = await fetch(
        `${GCAL_API}/calendars/${encodeURIComponent(calId)}/events?${params}`,
        { headers },
      )
      if (!res.ok) return []
      const data = await res.json()
      return (data.items ?? []) as any[]
    }),
  )

  return eventArrays.flat()
}
