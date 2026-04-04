import { db, Leftovers, type CalCatMap, type Schedule } from "./db"
import { getAllEvents } from "./cal/calController"
import { MILLISECOND } from "./time"

export function loadSchedule(): Promise<Schedule[]> {
  return db.schedule.where("calId").equals("").toArray()
}

export async function saveSchedule(newSchedule: Omit<Schedule, "id">[]): Promise<void> {
  await db.transaction("rw", db.schedule, async () => {
    await db.schedule.where("calId").equals("").delete()
    await db.schedule.bulkAdd(newSchedule)
  })
}

export async function refreshEvents() {
  /*
  - fetch all events for the week from Google calendar (use single event mode)
  - delete all Google calendar events for the week (This is so that I don't have to compare between the two to figure out which ones should be added modified or deleted)
  - load the ID:category mapping into memory (This is stored in a single db entry)
  - for every event from the API:
      - look up if it already has a category assigned to its event ID/ recurrence ID. If it does, copy that mapping to a new id: category mapping that contains only rules that were used in this current refresh cycle (this will clean out mappings for one off events in prior weeks. It will erroneously delete mappings where I have a week off like break, but this is inevitable without more complex logic)
      - add the new event to the database
 */
  await db.schedule.where("calId").notEqual("").delete()
  const idCatMapping = ((await db.metadata.get("calIdCatMap"))?.value || {}) as CalCatMap
  const usedMappings: CalCatMap = {}
  const newEvents: Omit<Schedule, "id">[] = []
  for (const event of await getAllEvents()) {
    if (event.transparency === "transparent") continue
    const eventId: string = event.recurringEventId ?? event.id
    let mapping = idCatMapping[eventId]
    if (!mapping) {
      mapping = {
        cat: "",
        subcat: "",
        leftovers: Leftovers.FREE,
      }
    }
    usedMappings[eventId] = mapping
    const start = new Date(event.start.dateTime)
    const end = new Date(event.end.dateTime)
    newEvents.push({
      ...mapping,
      day: (start.getDay() + 6) % 7, // -1 b/c my weeks start on Monday
      calId: eventId,
      duration: (end.getTime() - start.getTime()) * MILLISECOND,
      name: event.summary,
    })
  }
  await db.metadata.put({ key: "calIdCatMap", value: usedMappings })
  await db.schedule.bulkPut(newEvents)
}
