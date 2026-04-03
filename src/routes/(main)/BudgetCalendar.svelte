<script lang="ts">
  import { getWeekStart, HOUR } from "$lib/time.js"
  import CalGrid from "$lib/cal/CalGrid.svelte"
  import CalEvent from "$lib/cal/CalEvent.svelte"
  import { db } from "$lib/db.js"
  import type { Schedule } from "$lib/db"

  let events = $state([] as (Schedule & { start: number })[])
  db.schedule.toArray().then((result) => {
    const dayOffset = Array.from({ length: 7 }).fill(0) as number[]
    events = result as any
    for (const event of events) {
      event.start = dayOffset[event.day]
      dayOffset[event.day] += event.duration / HOUR
    }
  })
</script>

<CalGrid tableHeight="200vh" currentWeekStart={getWeekStart()}>
  {#each events as event}
    <CalEvent
      startHour={event.start}
      duration={event.duration / HOUR}
      dayIndex={event.day}
      color="red"
    >
      {event.name || event.subcat}
    </CalEvent>
  {/each}
</CalGrid>
