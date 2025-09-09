export const MINUTE = 1
export const SECOND = MINUTE / 60
export const MILLISECOND = SECOND / 1000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export function fmtDuration(minutes: number) {
  const sign = minutes < 0 ? "-" : ""
  const abs = Math.abs(minutes)
  const hours = Math.floor(abs / HOUR)
  const remaining = abs % HOUR
  return [
    sign,
    hours ? `${hours}h ` : "",
    (remaining || !hours) ? `${remaining}m` : ""
  ].join("")
}

/** Get the start of the current week (Monday) */
export function getWeekStart(): number {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  const monday = new Date(now.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return monday.getTime() * MILLISECOND
}

export const nowMinutes = () => Math.floor(Date.now() * MILLISECOND)

// Parse time string in format like "1h 30m", "45m", "2h"
export function parseTimeString(timeStr: string): number {
  const trimmed = timeStr.trim().toLowerCase()
  let totalMinutes = 0

  // Match hours
  const hoursMatch = trimmed.match(/(\d+)h/)
  if (hoursMatch) {
    totalMinutes += parseInt(hoursMatch[1]) * 60
  }

  // Match minutes
  const minutesMatch = trimmed.match(/(\d+)m/)
  if (minutesMatch) {
    totalMinutes += parseInt(minutesMatch[1])
  }

  return totalMinutes
}
