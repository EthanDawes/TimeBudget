export const MINUTE = 1
export const SECOND = MINUTE / 60
export const MILLISECOND = SECOND / 1000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY

export const daysOfWeek = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]

export function fmtDuration(minutes: number, explicitPositive = false) {
  minutes = Math.round(minutes) // Round now instead of later to avoid weird "4h 60m"
  const sign = minutes < 0 ? "-" : explicitPositive ? "+" : ""
  const abs = Math.abs(minutes)
  const hours = Math.floor(abs / HOUR)
  const remaining = abs % HOUR
  return [sign, hours ? `${hours}h ` : "", remaining || !hours ? `${remaining}m` : ""]
    .join("")
    .trim()
}

// getWeekStart and getWeekId serve different purposes that cannot be combined:
// getWeekStart is for local monday at midnight (for UI)
// getWeekId is UTC and for consistent database storage/ week identification

/** Get the start of the current week (Monday) in local time */
export function getWeekStart(): number {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  const monday = new Date(now.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return monday.getTime() * MILLISECOND
}

/** Get the UTC Monday midnight epoch (ms) identifying the current week, for use as weekId */
export function getWeekId(): number {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sunday
  const daysToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + daysToMonday)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.getTime()
}

export const nowMinutes = () => Date.now() * MILLISECOND

// Since my weeks start on Monday. +6 instead of -1 b/c mod doesn't support wrap-arround
export const shiftWeekday = (weekday: number) => (weekday + 6) % 7

// Parse time string in format like "1h 30m", "45m", "2h"
export function parseDuration(timeStr: string): number {
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

  // sign
  if (trimmed[0] === "-") {
    totalMinutes *= -1
  }

  return totalMinutes
}

export function formatTimeFromMinutes(minutes: number): string {
  // Convert minutes-since-epoch to a Date object to get local time
  const date = new Date(minutes / MILLISECOND) // Convert minutes to milliseconds
  const hours = date.getHours()
  const mins = date.getMinutes()
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

export function parseTimeToMinutes(timeText: string, baseDate: number = nowMinutes()): number {
  try {
    const [hours, minutes] = timeText.split(":").map(Number)

    // Create a Date object from the baseDate to get the current day in local time
    const baseDateTime = new Date(baseDate / MILLISECOND)

    // Create a new Date for the same day but with the specified time
    const targetDate = new Date(
      baseDateTime.getFullYear(),
      baseDateTime.getMonth(),
      baseDateTime.getDate(),
      hours,
      minutes,
      0,
      0,
    )

    // Convert back to minutes-since-epoch
    return Math.floor(targetDate.getTime() * MILLISECOND)
  } catch {
    return baseDate
  }
}

export const dateToExcel = (date: Date) => {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)) // Dec 30, 1899 because of leap year bug
  return ((date.getTime() - excelEpoch.getTime()) * MILLISECOND) / DAY
}
