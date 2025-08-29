import Dexie, { type EntityTable } from "dexie"

export interface TimeEntry {
  id: number
  category: string
  subcategory: string
  timestampStart: number
  timestampEnd?: number
}

const db = new Dexie("FriendsDatabase") as Dexie & {
  friends: EntityTable<
    TimeEntry,
    "id" // primary key "id" (for the typings only)
  >
}

// Schema declaration:
db.version(1).stores({
  friends: "++id, category, subcategory, timestampStart", // primary key "id" (for the runtime!)
})

export type { TimeEntry }
export { db }
