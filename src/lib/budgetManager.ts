import { db, type Budget, type TimeEntry } from "./db"
import { DAY, getWeekId, getWeekStart, nowMinutes, fmtDuration, MILLISECOND } from "./time"
import _ from "lodash"

// { Category and CategorySubcategory (concatenated): spent time }
export type AccumulatedTime = Record<string, number>

const GLOBAL_CONFIG_WEEK_ID = -1

// Load global budget configuration from IndexedDB
export async function loadBudgetConfig(): Promise<Budget[]> {
  const record = await db.budget.where("weekId").equals(GLOBAL_CONFIG_WEEK_ID).first()
  if (record) return record.budget
  throw new Error("Tried loading budget before db initialized")
}

// Save global budget configuration to IndexedDB
export async function saveBudgetConfig(budget: Budget[], startImmediate = false): Promise<void> {
  const weekId = startImmediate ? getWeekId() : GLOBAL_CONFIG_WEEK_ID
  const existing = await db.budget.where("weekId").equals(weekId).first()
  if (existing) {
    await db.budget.update(existing.id, { budget })
  } else {
    await db.budget.add({ weekId, budget })
  }
  if (startImmediate) saveBudgetConfig(budget, false)
}

// Load weekly budget (with reallocations applied) from IndexedDB.
// If no entry exists for the current week, creates one from the global config.
export async function loadWeeklyBudgetConfig(): Promise<Budget[]> {
  const weekId = getWeekId()

  return db.transaction("rw", db.budget, async () => {
    const record = await db.budget.where("weekId").equals(weekId).first()
    if (record) return record.budget

    // No weekly budget yet; seed from global config
    const globalBudget = await loadBudgetConfig()
    const newBudget = structuredClone(globalBudget)
    await db.budget.add({ weekId, budget: newBudget })
    return newBudget
  })
}

// Save weekly budget configuration with reallocations
export async function saveWeeklyBudgetConfig(budget: Budget[]): Promise<void> {
  const weekId = getWeekId()
  await db.transaction("rw", db.budget, async () => {
    const existing = await db.budget.where("weekId").equals(weekId).first()
    if (existing) {
      await db.budget.update(existing.id, { budget })
    } else {
      await db.budget.add({ weekId, budget })
    }
  })
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

export function getUnallocatedTime(budget: Budget[]) {
  return 7 * DAY - budget.reduce((acc, cat) => acc + cat.time, 0)
}

export function calculateOverage(budget: Budget[], accumulatedTime: AccumulatedTime) {
  let overage = 0
  const categoryOverages = calculateCategoryOverage(budget, accumulatedTime)

  for (const category of budget) {
    // Calculate category buffer (total category time minus sum of subcategories)
    const categoryBuffer =
      category.time - category.subcategories.reduce((sum, s) => sum + s.time, 0)

    // If subcategory overages exceed the category buffer, the excess comes from unallocated time
    const categoryOverage = categoryOverages[category.name] ?? 0
    overage += Math.max(0, categoryOverage - categoryBuffer)
  }
  return overage
}

export function calculateCategoryOverage(budget: Budget[], accumulatedTime: AccumulatedTime) {
  const categoryOverages: Record<string, number> = {}

  for (const category of budget) {
    let totalOverage = 0

    for (const sub of category.subcategories) {
      const subcategorySpent = accumulatedTime[category.name + sub.name] ?? 0
      const subcategoryOverage = Math.max(0, subcategorySpent - sub.time)
      totalOverage += subcategoryOverage
    }

    categoryOverages[category.name] = totalOverage
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

  const endTime = nowMinutes()
  const duration = endTime - task.timestampStart

  // Check if task crosses date boundary and split if necessary
  if (crossesDateBoundary(task.timestampStart, endTime)) {
    await splitTaskAtDateBoundary(task, endTime)
  } else {
    await db.timeEntries.update(task.id, { duration })
  }
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

  const endTime = nowMinutes()
  const duration = endTime - task.timestampStart

  // Check if task crosses date boundary and split if necessary
  if (crossesDateBoundary(task.timestampStart, endTime)) {
    await splitTaskAtDateBoundary(task, endTime)
  } else {
    await db.timeEntries.update(taskId, { duration })
  }
}

export async function switchTaskConcurrent(category: string, subcategory: string) {
  const lastTask = await activeTimer()

  // If no active task, just start new one
  if (!lastTask || lastTask.duration) {
    await startNewTask(category, subcategory)
    return
  }

  // This is where logic to start concurrent tasks used to be (check git history to restore)
  await finishTask()
  await startNewTask(category, subcategory)
}

// Reallocate time between categories/subcategories
export function reallocateTime(
  budget: Budget[],
  fromCategory: string | null, // Null if moving from unallocated time
  fromSubcategory: string | null,
  toCategory: string | null, // Null if moving to unallocated time
  toSubcategory: string | null,
  amount: number,
): Budget[] {
  const newBudget: Budget[] = JSON.parse(JSON.stringify(budget)) // Deep clone

  const findCat = (name: string) => newBudget.find((c) => c.name === name)!
  const findSub = (cat: Budget, name: string) => cat.subcategories.find((s) => s.name === name)!

  // Remove time from source
  if (fromCategory) {
    const fromCat = findCat(fromCategory)
    if (fromSubcategory) {
      findSub(fromCat, fromSubcategory).time -= amount
      // If moving between different categories, also adjust category-level time
      if (fromCategory !== toCategory) {
        fromCat.time -= amount
      }
    } else {
      fromCat.time -= amount
    }
  }

  // Add time to destination
  if (toCategory) {
    const toCat = findCat(toCategory)
    if (toSubcategory) {
      findSub(toCat, toSubcategory).time += amount
      // If moving between different categories, also adjust category-level time
      if (fromCategory !== toCategory) {
        toCat.time += amount
      }
    } else if (fromCategory !== toCategory) {
      toCat.time += amount
    }
  }
  // If toCategory is null, we're moving to unallocated time (no action needed)

  return newBudget
}

// Get available time for reallocation from a category/subcategory or unallocated time
export function getAvailableTime(
  budget: Budget[],
  accumulatedTime: AccumulatedTime,
  category: string | null,
  subcategory: string | null,
): number {
  // Handle unallocated time
  if (category === null) {
    const unallocatedTime = getUnallocatedTime(budget)
    const overage = calculateOverage(budget, accumulatedTime)
    return Math.max(0, unallocatedTime - overage)
  }

  const cat = budget.find((c) => c.name === category)!
  const key = subcategory ? category + subcategory : category
  const spent = accumulatedTime[key] ?? 0

  if (subcategory) {
    const sub = cat.subcategories.find((s) => s.name === subcategory)!
    return Math.max(0, sub.time - spent)
  } else {
    const allocatedTime = cat.time - cat.subcategories.reduce((sum, s) => sum + s.time, 0)
    return allocatedTime - (calculateCategoryOverage(budget, accumulatedTime)[category] ?? 0)
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
  budget: Budget[],
  accumulatedTime: AccumulatedTime,
  fromCategory: string | null,
  fromSubcategory: string | null,
  toCategory: string | null,
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
      error: `Only ${fmtDuration(availableTime)} available for rebudgeting`,
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

// Helper function to check if a task crosses a date boundary
function crossesDateBoundary(startTime: number, endTime: number): boolean {
  // Convert minutes-since-epoch to Date objects
  const startDate = new Date(startTime / MILLISECOND)
  const endDate = new Date(endTime / MILLISECOND)

  // Check if they're on different calendar dates
  return (
    startDate.getDate() !== endDate.getDate() ||
    startDate.getMonth() !== endDate.getMonth() ||
    startDate.getFullYear() !== endDate.getFullYear()
  )
}

// Helper function to get midnight timestamp for a given date
function getMidnight(timestamp: number): number {
  const date = new Date(timestamp / MILLISECOND)
  const midnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1, // Next day at 00:00
    0,
    0,
    0,
    0,
  )
  return midnight.getTime() * MILLISECOND
}

// Split a task that crosses date boundary
async function splitTaskAtDateBoundary(task: TimeEntry, endTime: number): Promise<void> {
  const midnight = getMidnight(task.timestampStart)

  // Update the original task to end at midnight
  const firstDuration = midnight - task.timestampStart
  await db.timeEntries.update(task.id, { duration: firstDuration })

  // Create a new task starting at midnight
  await db.timeEntries.add({
    category: task.category,
    subcategory: task.subcategory,
    timestampStart: midnight,
    duration: endTime - midnight,
  })

  console.log(`Split task across date boundary: ${task.category}/${task.subcategory}`)
}
