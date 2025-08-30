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
