import Dexie, { type EntityTable } from "dexie"
import { MILLISECOND, nowMinutes } from "./time"

export interface TimeEntry {
  id: number
  category: string
  subcategory: string
  timestampStart: number
  duration?: number
}

export const db = new Dexie("TimeBudgetDb") as Dexie & {
  timeEntries: EntityTable<
    TimeEntry,
    "id" // primary key "id" (for the typings only)
  >
}

// Schema declaration:
db.version(1).stores({
  timeEntries: "++id, category, [category+subcategory], timestampStart", // primary key "id" (for the runtime!)
})

export async function exportSpentTime() {
  // Get all time entries from the database
  const allEntries = await db.timeEntries.toArray()

  // Remove last record because it's in progress and not useful
  allEntries.pop()

  // Create CSV header
  const csvHeader = "ID,Category,Subcategory,Start Time,Duration (minutes),End Time\n"

  // Convert entries to CSV rows
  const csvRows = allEntries
    .map((entry) => {
      const startTime = new Date(entry.timestampStart / MILLISECOND).toISOString()
      const endTime = entry.duration
        ? new Date((entry.timestampStart + entry.duration) / MILLISECOND).toISOString()
        : "" // This state indicates an error, past events should not be in progress

      return `${entry.id},"${entry.category}","${entry.subcategory}","${startTime}",${entry.duration},"${endTime}"`
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
