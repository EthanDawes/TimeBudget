import { db, type TimeEntry } from "./db"
import { DAY, getWeekStart, nowMinutes, fmtDuration } from "./time"
import _ from "lodash"

const STORAGE_KEYS = {
  BUDGET_CONFIG: "timeBudget_config",
  WEEKLY_DATA: "timeBudget_weeklyData",
  WEEKLY_BUDGET: "timeBudget_weeklyBudget",
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

// Load global budget configuration from localStorage
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

// Load weekly budget (with reallocations applied) from localStorage
export function loadWeeklyBudgetConfig(): BudgetConfig {
  const stored = localStorage.getItem(STORAGE_KEYS.WEEKLY_BUDGET)
  if (stored) {
    const weeklyBudget = JSON.parse(stored)
    // Check if it's from the current week by comparing a timestamp
    const currentWeekStart = getWeekStart()
    if (weeklyBudget._weekStart === currentWeekStart) {
      delete weeklyBudget._weekStart
      return weeklyBudget
    }
  }

  // If no weekly budget or it's from a previous week, use global budget
  return loadBudgetConfig()
}

// Save weekly budget configuration with reallocations
export function saveWeeklyBudgetConfig(config: BudgetConfig): void {
  const configWithWeek = {
    ...config,
    _weekStart: getWeekStart(),
  }
  localStorage.setItem(STORAGE_KEYS.WEEKLY_BUDGET, JSON.stringify(configWithWeek))
}

// Save global budget configuration to localStorage
export function saveBudgetConfig(config: BudgetConfig): void {
  localStorage.setItem(STORAGE_KEYS.BUDGET_CONFIG, JSON.stringify(config))
}

export async function loadWeeklyData() {
  return db.timeEntries.where("timestampStart").above(getWeekStart()).toArray()
}

export function activeTimer() {
  return db.timeEntries.orderBy(":id").last()
}

export async function activeTimers() {
  return db.timeEntries.filter((entry) => entry.duration === undefined).toArray()
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

export function calculateCategoryOverage(budget: BudgetConfig, accumulatedTime: AccumulatedTime) {
  const categoryOverages: Record<string, number> = {}

  for (const [categoryName, category] of Object.entries(budget)) {
    let totalOverage = 0

    // Sum up overages from individual subcategories
    for (const [subcategoryName, subcategoryBudget] of Object.entries(category.subcategories)) {
      const subcategorySpent = accumulatedTime[categoryName + subcategoryName] ?? 0
      const subcategoryOverage = Math.max(0, subcategorySpent - subcategoryBudget)
      totalOverage += subcategoryOverage
    }

    categoryOverages[categoryName] = totalOverage
  }

  return categoryOverages
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

export async function finishTaskById(taskId: number) {
  const task = await db.timeEntries.get(taskId)
  if (!task) {
    console.warn("Trying to stop a task that doesn't exist")
    return
  }
  if (task.duration) {
    console.warn("Trying to stop a task that's already stopped")
    return
  }

  // Check if this is the last running task - if so, don't allow stopping it
  const runningTasks = await activeTimers()
  if (runningTasks.length <= 1) {
    console.warn("Cannot stop the last running task - at least one task must always be running")
    return
  }

  await db.timeEntries.update(taskId, { duration: nowMinutes() - task.timestampStart })
}

export async function switchTaskConcurrent(category: string, subcategory: string) {
  const lastTask = await activeTimer()

  // If no active task, just start new one
  if (!lastTask || lastTask.duration) {
    await startNewTask(category, subcategory)
    return
  }

  // If last task was started within 30 seconds (0.5 minutes in our time units), start concurrent task
  const timeSinceLastStart = nowMinutes() - lastTask.timestampStart
  if (timeSinceLastStart <= 0.5) {
    await startNewTask(category, subcategory)
  } else {
    // Otherwise, finish the last task and start new one
    await finishTask()
    await startNewTask(category, subcategory)
  }
}

// Reallocate time between categories/subcategories
export function reallocateTime(
  budget: BudgetConfig,
  fromCategory: string | null, // Null if moving from unallocated tmie
  fromSubcategory: string | null,
  toCategory: string,
  toSubcategory: string | null,
  amount: number,
): BudgetConfig {
  const newBudget = JSON.parse(JSON.stringify(budget)) // Deep clone since structuredClone doesn't work with svelte objects >:(

  // Remove time from source
  if (fromCategory) {
    if (fromSubcategory) {
      newBudget[fromCategory].subcategories[fromSubcategory] -= amount
      // If moving between different categories, also adjust category-level time
      if (fromCategory !== toCategory) {
        newBudget[fromCategory].time -= amount
      }
    } else {
      newBudget[fromCategory].time -= amount
    }
  }

  // Add time to destination
  if (toSubcategory) {
    newBudget[toCategory].subcategories[toSubcategory] += amount
    // If moving between different categories, also adjust category-level time
    if (fromCategory !== toCategory) {
      newBudget[toCategory].time += amount
    }
  } else {
    newBudget[toCategory].time += amount
  }

  return newBudget
}

// Get available time for reallocation from a category/subcategory
export function getAvailableTime(
  budget: BudgetConfig,
  accumulatedTime: AccumulatedTime,
  category: string,
  subcategory: string | null,
): number {
  const key = subcategory ? category + subcategory : category
  const spent = accumulatedTime[key] ?? 0

  if (subcategory) {
    // For subcategories, available time is limited by both the subcategory budget
    // and the remaining time at the category level
    const subcategoryAllocated = budget[category].subcategories[subcategory]
    const subcategoryAvailable = Math.max(0, subcategoryAllocated - spent)

    // Calculate category buffer (total category time minus sum of subcategories)
    const totalSubcategoryBudget = Object.values(budget[category].subcategories).reduce(
      (sum, budget) => sum + budget,
      0,
    )
    const categoryBuffer = budget[category].time - totalSubcategoryBudget
    const categorySpent = accumulatedTime[category] ?? 0
    const categoryAvailable = Math.max(0, budget[category].time - categorySpent)

    // Available time is the minimum of subcategory available and category available
    return Math.min(subcategoryAvailable, categoryAvailable)
  } else {
    const category_obj = budget[category]
    const allocated_time =
      category_obj.time -
      Object.values(category_obj.subcategories).reduce((sum, budget) => sum + budget, 0)
    return allocated_time - (calculateCategoryOverage(budget, accumulatedTime)[category] ?? 0)
  }
}

// Delete tasks that have been running for longer than 24 hours
export async function cleanupLongRunningTasks(): Promise<void> {
  const now = nowMinutes()
  const runningTasks = await activeTimers()

  // Find tasks that need to be deleted
  for (const task of runningTasks) {
    const runningTime = now - task.timestampStart

    // If task has been running for more than 24 hours (DAY minutes), mark for deletion
    if (runningTime > DAY) {
      await db.timeEntries.delete(task.id)
      console.log(
        `Deleted long-running task: ${task.category}/${task.subcategory} (running for ${fmtDuration(runningTime)})`,
      )
    }
  }
}

// Validate if a reallocation is possible
export function validateReallocation(
  budget: BudgetConfig,
  accumulatedTime: AccumulatedTime,
  fromCategory: string,
  fromSubcategory: string | null,
  toCategory: string,
  toSubcategory: string | null,
  amount: number,
): { valid: boolean; error?: string } {
  if (amount <= 0) {
    return { valid: false, error: "Amount must be positive" }
  }

  const availableTime = getAvailableTime(budget, accumulatedTime, fromCategory, fromSubcategory)

  if (amount > availableTime) {
    return {
      valid: false,
      error: `Only ${fmtDuration(availableTime)} available for reallocation`,
    }
  }

  // Check if source and destination are the same
  if (fromCategory === toCategory && fromSubcategory === toSubcategory) {
    return { valid: false, error: "Source and destination cannot be the same" }
  }

  return { valid: true }
}

export interface SplitEntry {
  id: string
  startTime: number
  startTimeText: string
  category: string
  subcategory: string
  isConcurrent: boolean
  endTime?: number
  endTimeText?: string
}

// Split time entries by replacing running tasks with new time periods
export async function splitTime(splitEntries: SplitEntry[]): Promise<void> {
  if (splitEntries.length === 0) return

  // Delete all currently running tasks (we're replacing them with split entries)
  const runningTasks = await activeTimers()
  for (const task of runningTasks) {
    await db.timeEntries.delete(task.id)
  }

  // Create new time entries based on the split
  for (let i = 0; i < splitEntries.length; i++) {
    const entry = splitEntries[i]
    const nextEntry = splitEntries[i + 1]

    let duration: number | undefined

    if (entry.isConcurrent && entry.endTime) {
      // Concurrent task with explicit end time
      duration = entry.endTime - entry.startTime
    } else if (!entry.isConcurrent && nextEntry) {
      // Sequential task - ends when next task starts
      duration = nextEntry.startTime - entry.startTime
    } else if (i === splitEntries.length - 1) {
      // Last entry - leave it running (no duration)
      duration = undefined
    }

    // Create the new time entry
    await db.timeEntries.add({
      category: entry.category,
      subcategory: entry.subcategory,
      timestampStart: entry.startTime,
      duration: duration,
    })
  }
}
