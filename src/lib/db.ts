import Dexie, { type EntityTable } from "dexie"

export interface TimeEntry {
  id: number
  category: string
  subcategory: string
  timestampStart: number
  duration?: number
}

const db = new Dexie("TimeBudgetDb") as Dexie & {
  timeEntries: EntityTable<
    TimeEntry,
    "id" // primary key "id" (for the typings only)
  >
}

// Schema declaration:
db.version(1).stores({
  timeEntries: "++id, category, [category+subcategory], timestampStart", // primary key "id" (for the runtime!)
})

export { db }
