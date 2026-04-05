<script lang="ts">
  import { getWeekStart, HOUR } from "$lib/time.js"
  import CalGrid from "$lib/cal/CalGrid.svelte"
  import CalEvent from "$lib/cal/CalEvent.svelte"
  import { db, type CalCatMap } from "$lib/db.js"
  import type { Budget, Schedule } from "$lib/db"
  import { getSubcategoryColor } from "$lib/cal/calUtil.svelte"
  import {
    loadBudgetConfig,
    loadWeeklyBudgetConfig,
    saveWeeklyBudgetConfig,
  } from "$lib/budgetManager.js"
  import { liveQuery } from "dexie"

  let {
    eventChannel,
    selectedDay = $bindable(),
  }: { eventChannel: EventTarget; selectedDay: number } = $props()

  let budget = $state([] as Budget[])
  let activeEvent = $state(null as (Schedule & { start: number }) | null)
  let selectEl = $state(null as HTMLSelectElement | null)
  let clickPos = $state({ x: 0, y: 0 })

  let _events = $derived(
    liveQuery(() =>
      db.schedule
        .orderBy("[day+cat+subcat]")
        .toArray()
        .then((result) => {
          const events = result as unknown as (Schedule & { start: number })[]
          const dayOffset = Array.from({ length: 7 }).fill(0) as number[]
          for (const event of events) {
            event.start = dayOffset[event.day]
            dayOffset[event.day] += event.duration / HOUR
          }
          return events
        }),
    ),
  )

  let events = $derived($_events)

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

  async function onselect(event: Schedule, cat: string, subcat: string) {
    const eventSelector = db.schedule.where("calId").equals(event.calId)

    // Adjust budget
    const events = await eventSelector.toArray()
    const budget = await loadWeeklyBudgetConfig()
    for (const event of events) {
      if (event.cat) {
        const budgetCat = budget.find((c) => c.name === event.cat)
        const budgetSubcat = budgetCat?.subcategories.find((sc) => sc.name === event.subcat)
        // event is already assigned to a cat, remove time from there
        if (budgetCat && budgetSubcat) {
          // TODO: these should be defined, except when cat renamed/finished. TODO: how to handle?
          if (!budgetSubcat.total) budgetSubcat.time -= event.duration
          if (!budgetCat.total) budgetCat.time -= event.duration
        }
      }
      // Add time to new (destination) category
      const budgetCat = budget.find((c) => c.name === cat)
      const budgetSubcat = budgetCat?.subcategories.find((sc) => sc.name === subcat)
      if (budgetCat && budgetSubcat) {
        if (!budgetSubcat.total) budgetSubcat.time += event.duration
        if (!budgetCat.total) budgetCat.time += event.duration
      }
    }
    await saveWeeklyBudgetConfig(budget)
    eventChannel.dispatchEvent(new CustomEvent("budgetChanged"))

    // Assign category to id
    const calCatMap = ((await db.metadata.get("calIdCatMap"))?.value || {}) as CalCatMap
    calCatMap[event.calId].cat = cat
    calCatMap[event.calId].subcat = subcat
    await db.metadata.put({ key: "calIdCatMap", value: calCatMap })
    await eventSelector.modify({ cat, subcat })
  }
</script>

<CalGrid
  tableHeight="200vh"
  currentWeekStart={getWeekStart()}
  onHeaderClick={(weekdayIdx) => (selectedDay = weekdayIdx)}
>
  {#each events as event}
    <CalEvent
      startHour={event.start}
      duration={event.duration / HOUR}
      dayIndex={event.day}
      color={event.cat ? getSubcategoryColor(event.cat, event.subcat) : "red"}
      onclick={event.calId ? handleEventClick.bind(null, event) : undefined}
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
