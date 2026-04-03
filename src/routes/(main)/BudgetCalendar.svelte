<script lang="ts">
  import { getWeekStart, HOUR } from "$lib/time.js"
  import CalGrid from "$lib/cal/CalGrid.svelte"
  import CalEvent from "$lib/cal/CalEvent.svelte"
  import { db } from "$lib/db.js"
  import type { Budget, Schedule } from "$lib/db"
  import { getSubcategoryColor } from "$lib/cal/calUtil.svelte"
  import { loadBudgetConfig } from "$lib/budgetManager.js"

  let events = $state([] as (Schedule & { start: number })[])
  let budget = $state([] as Budget[])
  let activeEvent = $state(null as (Schedule & { start: number }) | null)
  let selectEl = $state(null as HTMLSelectElement | null)
  let clickPos = $state({ x: 0, y: 0 })

  db.schedule
    .orderBy("[day+cat+subcat]")
    .toArray()
    .then((result) => {
      const dayOffset = Array.from({ length: 7 }).fill(0) as number[]
      events = result as any
      for (const event of events) {
        event.start = dayOffset[event.day]
        dayOffset[event.day] += event.duration / HOUR
      }
    })

  loadBudgetConfig().then((b) => (budget = b))

  function handleEventClick(event: Schedule & { start: number }, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    clickPos = { x: rect.left, y: rect.bottom }
    activeEvent = event
    requestAnimationFrame(() => selectEl?.showPicker?.())
  }

  function handleSelectChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value
    if (!value || !activeEvent) return
    const [cat, subcat] = value.split("|")
    onselect?.(activeEvent, cat, subcat)
    activeEvent = null
  }

  function handleSelectBlur() {
    activeEvent = null
  }

  function onselect(event: Schedule, category: string, subcategory: string) {
    console.log(event, category, subcategory, "selected")
  }
</script>

<CalGrid tableHeight="200vh" currentWeekStart={getWeekStart()}>
  {#each events as event}
    <CalEvent
      startHour={event.start}
      duration={event.duration / HOUR}
      dayIndex={event.day}
      color={event.cat ? getSubcategoryColor(event.cat, event.subcat) : "red"}
      onclick={event.cat ? undefined : handleEventClick.bind(null, event)}
    >
      {event.name || event.subcat}
    </CalEvent>
  {/each}
</CalGrid>

{#if activeEvent}
  <select
    bind:this={selectEl}
    class="pointer-events-none fixed opacity-0"
    style:left="{clickPos.x}px"
    style:top="{clickPos.y}px"
    onchange={handleSelectChange}
    onblur={handleSelectBlur}
  >
    <option value="">— select category —</option>
    {#each budget as cat}
      <optgroup label={cat.name}>
        {#each cat.subcategories as sub}
          <option value="{cat.name}|{sub.name}">{sub.name}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
{/if}
