export const MINUTE = 1
export const SECOND = MINUTE / 60
export const MILLISECOND = SECOND / 1000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export function fmtDuration(minutes: number) {
  const hours = Math.floor(minutes / HOUR)
  const remainingMinutes = minutes % HOUR
  let fmtStr = ""
  if (hours) fmtStr = hours + "h "
  if (remainingMinutes || !hours) fmtStr += remainingMinutes + "m"
  return fmtStr
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
