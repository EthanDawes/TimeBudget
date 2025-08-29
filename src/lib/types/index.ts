export interface BudgetConfig {
  [category: string]: {
    // Total budgeted time for this category. Can be larger than the sum of subcategories to allow for wiggle room
    time: number
    subcategories: {
      [subcategory: string]: number
    }
  }
}

export interface TimeEntry {
  category: string
  subcategory: string
  timestampStart: number
  timestampEnd?: number
}

export interface WeeklyTimeData {
  weekStart: string // ISO date string of Monday
  entries: TimeEntry[]
  activeTimer: {
    category: string
    subcategory: string
    eventName: string
    startTime: number // timestamp
  } | null
}

export interface CategoryProgress {
  category: string
  subcategory: string
  eventName: string
  budgeted: number // in minutes
  used: number // in minutes
  percentage: number
}
