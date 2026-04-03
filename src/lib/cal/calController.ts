import { getWeekStart, MILLISECOND, DAY } from "$lib/time"
import { db } from "$lib/db"

const GCAL_API = "https://www.googleapis.com/calendar/v3"
const TOKEN_KEY = "gcal_access_token"

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY)
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
          setAccessToken(response.access_token)
          resolve(response.access_token)
        }
      },
    })
    client.requestAccessToken()
  })
}

export async function getAllCalendars(): Promise<any[]> {
  const token = getAccessToken()
  if (!token) throw new Error("Not authenticated with Google")

  const headers = { Authorization: `Bearer ${token}` }

  const calListRes = await fetch(`${GCAL_API}/users/me/calendarList`, { headers })
  if (!calListRes.ok) throw new Error(`Failed to fetch calendar list: ${calListRes.status}`)
  const calList = await calListRes.json()

  return calList.items
}

/** Returns all events happening this week from all calendars */
export async function getAllEvents(): Promise<any[]> {
  const token = getAccessToken()
  if (!token) throw new Error("Not authenticated with Google")

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
