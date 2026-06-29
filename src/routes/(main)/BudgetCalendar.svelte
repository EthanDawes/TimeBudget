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
  import {
    isConnected,
    getClientId,
    isTokenExpired,
    getAccessToken,
    connectWithGoogle,
  } from "$lib/cal/calController"
  import { refreshEvents } from "$lib/scheduleManager"
  import { onMount } from "svelte"

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

  function handleScheduleClick(event: Schedule & { start: number }) {
    selectedDay = event.day
    eventChannel.dispatchEvent(
      new CustomEvent("scheduleClicked", { detail: { cat: event.cat, subcat: event.subcat } }),
    )
  }

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
        if (!budgetCat.total && !budgetSubcat.total) budgetCat.time += event.duration
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

  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? getClientId() ?? ""
  let isSyncing = $state(false)
  let needsPrompt = $state(false)

  onMount(async () => {
    // Check if Google Calendar integration has been configured
    const clientId = GOOGLE_CLIENT_ID
    const enabledCalsRecord = await db.metadata.get("enabledCals")
    const enabledCals = enabledCalsRecord?.value as string[] | undefined
    const isConfigured = !!clientId && enabledCals && enabledCals.length > 0

    if (!isConfigured) return

    // Verify token status
    const token = getAccessToken()
    const isExpired = isTokenExpired()

    if (token && !isExpired) {
      // Token is valid; attempt background refresh silently
      isSyncing = true
      try {
        await refreshEvents()
        needsPrompt = false
      } catch (e) {
        console.warn("Background calendar sync failed, authentication required:", e)
        needsPrompt = true
      } finally {
        isSyncing = false
      }
    } else {
      // Token is missing or expired. To avoid unexpected/alarming popups on load,
      // we do not trigger auto-sync and instead show the re-auth overlay.
      needsPrompt = true
    }
  })

  const sync = async () => {
    if (!isConnected() || isSyncing) return
    isSyncing = true
    try {
      await refreshEvents()
      needsPrompt = false
    } catch (e) {
      console.warn("Periodic calendar sync failed:", e)
      needsPrompt = true
    } finally {
      isSyncing = false
    }
  }
</script>

<div class="relative h-[200vh] w-full">
  <CalGrid
    tableHeight="200vh"
    currentWeekStart={getWeekStart()}
    onHeaderClick={(weekdayIdx) => (selectedDay = weekdayIdx)}
  >
    {#snippet corner()}
      <button class="h-full w-full" class:animate-spin={isSyncing} onclick={sync}> 🔄️ </button>
    {/snippet}

    {#each events as event}
      <CalEvent
        startHour={event.start}
        duration={event.duration / HOUR}
        dayIndex={event.day}
        color={event.cat ? getSubcategoryColor(event.cat, event.subcat) : "red"}
        onclick={event.calId
          ? handleEventClick.bind(null, event)
          : handleScheduleClick.bind(null, event)}
        tooltip={event.name || event.subcat}
      >
        {event.name || event.subcat}
      </CalEvent>
    {/each}
  </CalGrid>

  {#if needsPrompt}
    <div class="sticky inset-0 bottom-0 z-50 flex items-end justify-center">
      <div
        class="mb-4 flex max-w-sm flex-col items-center rounded-2xl border border-gray-100 bg-white p-2 text-center shadow-xl"
      >
        <p class="text-sm text-orange-400">Calendar could be out of date</p>
        <button
          class="mt-2 flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-95"
          onclick={sync}
          disabled={isSyncing}
        >
          {#if isSyncing}
            <span class="animate-spin">🔄</span>
            <span>Authorizing...</span>
          {:else}
            <span>🔄</span>
            <span>Authorize & Refresh</span>
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>

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
