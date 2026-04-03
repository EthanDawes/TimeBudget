import Dexie, { type EntityTable } from "dexie"
import dexieCloud, { type DexieCloudTable } from "dexie-cloud-addon"
import { MILLISECOND, DAY } from "./time"

export interface TimeEntry {
  id: number
  category: string
  subcategory: string
  // Epoch minutes
  timestampStart: number
  duration?: number
}

export interface Budget {
  name: string
  time: number
  total: boolean // This is same as unrealized budget (don't just set true) so then I don't have to load/check the global config to know what to do when adding new event
  subcategories: { name: string; time: number; total: boolean }[]
}

// Since I'm going to load an entire week's budget into memory at once, it doesn't make sense to split entries by category
// This also lets me store budgeting history (if reallocs made)
export interface WeekBudget {
  id: string
  weekId: number // When realized, this is some week identifier. Otherwise, it's -1
  budget: Budget[]
}

export enum Leftovers {
  ROLLOVER = -1,
  FREE = -2,
}

// When replacing schedules made by `budget-generator`, delete & replace all entries with `calId` blank
// Schedule doesn't need history because it evolves towards the ultimate spent time at end of week
export interface Schedule {
  id: string
  name?: string // event name
  day: number // index to week
  duration: number // minutes
  calId: string // This should be the gcal id, or if repeating, `recurringEventId`. If not a gcal event, is empty string
  leftovers: Leftovers
  // cat and subcat can be empty string when an event has been imported from gcal, but not assigned yet
  cat: string
  subcat: string
  // Date field is not needed because schedule recreated every week
}

export type PersistentPartialSchedule = Pick<Schedule, "cat" | "subcat" | "leftovers">
export type CalCatMap = Record<string, PersistentPartialSchedule>
type Metadata =
  | { key: "calIdCatMap"; value: CalCatMap }
  | { key: "schedule"; value: Schedule[] } // This is diff from entries in "schedule" table without a "calId" field because if I ever want to reset the budget week-to-week, these are the defaults that should be restored. TODO: implement
  | { key: "enabledCals"; value: string[] }

export const db = new Dexie("TimeBudgetDb", { addons: [dexieCloud] }) as Dexie & {
  timeEntries: DexieCloudTable<
    TimeEntry,
    "id" // primary key "id" (for the typings only)
  >
  budget: DexieCloudTable<WeekBudget, "id">
  schedule: DexieCloudTable<Schedule, "id">
  metadata: DexieCloudTable<Metadata, "key">
}

// Schema declaration:
db.version(8).stores({
  timeEntries: "@id, category, [category+subcategory], timestampStart", // primary key "id" (for the runtime!)
  budget: "@id, weekId",
  schedule: "@id, calId, [day+cat+subcat]", // This mega-multi-index is for easy sorting (so events are properly grouped in calendar)
  metadata: "key",
})

db.on("populate", (transaction) => {
  const DEFAULT_BUDGET: Budget[] = [
    {
      name: "category",
      time: 600,
      total: false,
      subcategories: [
        { name: "a", time: 100, total: false },
        { name: "b", time: 400, total: false },
      ],
    },
  ]

  // Id cannot auto-generate here. Just need to do this once, then everything else works fine
  transaction.table("budget").add({ id: "bdg-1", weekId: -1, budget: DEFAULT_BUDGET })
})

db.cloud.configure({
  databaseUrl: "https://zwbp22kky.dexie.cloud",
  // Auth should not be required, can use offline
})

export async function exportSpentTime() {
  // Get all time entries from the database
  const allEntries = await db.timeEntries.toArray()

  // Remove last record because it's in progress and not useful
  allEntries.pop()

  // Create CSV header
  const csvHeader = "ID,Category,Subcategory,Start Time,Duration (days)\n"

  // Convert entries to CSV rows
  const csvRows = allEntries
    .map((entry) => {
      const startTime = new Date(entry.timestampStart / MILLISECOND).toISOString()

      return `${entry.id},"${entry.category}","${entry.subcategory}","${startTime}",${entry.duration! / DAY}`
    })
    .join("\n")

  // Combine header and rows
  const csvContent = csvHeader + csvRows

  // Create and download the file
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute(
      "download",
      `time-budget-export-${new Date().toISOString().split("T")[0]}.csv`,
    )
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

// Export table: await db.<table>.toArray()
// Import table (in 1 transaction): 1: whatever clearing logic 2: await table.bulkAdd(<rows>)
