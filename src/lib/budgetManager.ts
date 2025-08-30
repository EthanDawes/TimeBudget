import { db, type TimeEntry } from "./db"
import { DAY, getWeekStart, nowMinutes } from "./time"
import _ from "lodash"

const STORAGE_KEYS = {
  BUDGET_CONFIG: "timeBudget_config",
  WEEKLY_DATA: "timeBudget_weeklyData",
}

// { Category and CategorySubcategory (concatenated): spent time }
export type AccumulatedTime = Record<string, number>

export interface BudgetConfig {
  [category: string]: {
    // Total budgeted time for this category. Can be larger than the sum of subcategories to allow for wiggle room
    time: number
    subcategories: {
      [subcategory: string]: number
    }
  }
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

export function activeTimer() {
  return db.timeEntries.orderBy(":id").last()
}

export function accumulateTime(entries: TimeEntry[]): AccumulatedTime {
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

export function calculateOverage(budget: BudgetConfig, accumulatedTime: AccumulatedTime) {
  let overage = 0
  for (const [categoryName, category] of Object.entries(budget)) {
    overage += Math.max(0, (accumulatedTime[categoryName] ?? 0) - category.time)
  }
  return overage
}

export async function startNewTask(category: string, subcategory: string) {
  await db.timeEntries.add({ category, subcategory, timestampStart: nowMinutes() })
}

export async function finishTask() {
  const task = await activeTimer()
  if (!task) {
    console.warn(
      "Stopping nonexistant task. This should only happen once, before any time entries are made",
    )
    return
  }
  console.assert(!task.duration) // Warn if trying to double-stop an entry
  await db.timeEntries.update(task.id, { duration: nowMinutes() - task.timestampStart })
}

export function exportSpentTime() {
  // TODO
}
