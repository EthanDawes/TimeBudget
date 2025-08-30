import { db, type TimeEntry } from "./db"
import { DAY } from "./time"
import type { BudgetConfig } from "./types"
import _ from "lodash"

const STORAGE_KEYS = {
  BUDGET_CONFIG: "timeBudget_config",
  WEEKLY_DATA: "timeBudget_weeklyData",
}

// Get the start of the current week (Monday)
export function getWeekStart(): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  const monday = new Date(now.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return monday
}

// Check if we need to reset for a new week
export function isNewWeek(lastWeekStart: string): boolean {
  const currentWeekStart = getWeekStart()
  const lastWeek = new Date(lastWeekStart)
  return currentWeekStart.getTime() !== lastWeek.getTime()
}

// Load budget configuration from localStorage
export function loadBudgetConfig(): BudgetConfig {
  const stored = localStorage.getItem(STORAGE_KEYS.BUDGET_CONFIG)
  if (stored) {
    return JSON.parse(stored)
  }

  // Return default config
  return {
    category: {
      time: 600,
      subcategories: {
        a: 100,
        b: 400,
      },
    },
  }
}

// Save budget configuration to localStorage
export function saveBudgetConfig(config: BudgetConfig): void {
  localStorage.setItem(STORAGE_KEYS.BUDGET_CONFIG, JSON.stringify(config))
}

export async function loadWeeklyData() {
  return db.timeEntries.where("timestampStart").above(getWeekStart()).toArray()
}

export async function activeTimer() {
  return db.timeEntries.orderBy(":id").last()
}

/*export async function getSpentWeekCatTime(timeEntries: TimeEntry[], name: [string] | [string, string]) {
  const [category, subcategory] = name
  return timeEntries.filter(timeEntry => timeEntry.category === category && (!subcategory || timeEntry.subcategory === subcategory))
}*/

export function accumulateTime(entries: TimeEntry[]): Record<string, number> {
  // sum by category
  const byCategory = _(entries)
    .groupBy("category")
    .mapValues((group) => _.sumBy(group, (e) => e.duration ?? 0))
    .value()

  // sum by category+subcategory
  const byCatSub = _(entries)
    .groupBy((e) => e.category + e.subcategory)
    .mapValues((group) => _.sumBy(group, (e) => e.duration ?? 0))
    .value()

  return { ...byCategory, ...byCatSub }
}

export function getUnallocatedTime(budget: BudgetConfig) {
  return 7 * DAY - Object.values(budget).reduce((acc, cat) => acc + cat.time, 0)
}
