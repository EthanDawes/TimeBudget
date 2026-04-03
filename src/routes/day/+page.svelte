<script lang="ts">
  import CalEvent from "$lib/cal/CalEvent.svelte"
  import { db, type TimeEntry } from "$lib/db"
  import { getWeekStart, MILLISECOND, HOUR, DAY } from "$lib/time"
  import CalGrid from "$lib/cal/CalGrid.svelte"
  import { getSubcategoryColor } from "$lib/cal/calUtil.svelte"

  const locale = navigator.language || "en-US"

  let currentWeekStart = $state(getWeekStart())
  let timeEntries: TimeEntry[] = $state([])

  let filteredWeekday: number | null = $state(null)
  let filteredSubcategory: string | null = $state(null)
  let groupingMode = $state(false)

  // Process entries for grouping mode
  const processedEntries = $derived.by(() => {
    if (!groupingMode) return timeEntries

    // Group entries by day, then by category, then by subcategory
    const groupedByDay = new Map()

    timeEntries.forEach((entry) => {
      if (!entry.duration) return

      const entryDate = new Date(entry.timestampStart / MILLISECOND)
      const dayKey =
        filteredWeekday !== null
          ? Math.floor(
              (currentWeekStart + filteredWeekday * DAY - entry.timestampStart) / (7 * DAY),
            )
          : Math.round(
              (new Date(
                entryDate.getFullYear(),
                entryDate.getMonth(),
                entryDate.getDate(),
              ).getTime() *
                MILLISECOND -
                currentWeekStart) /
                DAY,
            )

      if (!groupedByDay.has(dayKey)) {
        groupedByDay.set(dayKey, new Map())
      }

      const dayGroups = groupedByDay.get(dayKey)
      const categoryKey = entry.category

      if (!dayGroups.has(categoryKey)) {
        dayGroups.set(categoryKey, new Map())
      }

      const categoryGroups = dayGroups.get(categoryKey)
      const subcategoryKey = entry.subcategory

      if (!categoryGroups.has(subcategoryKey)) {
        categoryGroups.set(subcategoryKey, [])
      }

      categoryGroups.get(subcategoryKey).push(entry)
    })

    // Convert back to flat array with adjusted start times
    const processedEntries = []

    for (const [dayKey, dayGroups] of groupedByDay) {
      let currentStartHour = 0 // Start stacking from midnight

      // Sort categories by name for consistent ordering
      const sortedCategories = Array.from(dayGroups.keys()).sort()

      for (const categoryKey of sortedCategories) {
        const categoryGroups = dayGroups.get(categoryKey)

        // Sort subcategories by name for consistent ordering
        const sortedSubcategories = Array.from(categoryGroups.keys()).sort()

        for (const subcategoryKey of sortedSubcategories) {
          const entries = categoryGroups.get(subcategoryKey)

          // Sort entries by original timestamp to maintain order
          entries.sort((a, b) => a.timestampStart - b.timestampStart)

          for (const entry of entries) {
            // Calculate the day start for this entry
            const entryDate = new Date(entry.timestampStart / MILLISECOND)
            const dayStartLocal = new Date(
              entryDate.getFullYear(),
              entryDate.getMonth(),
              entryDate.getDate(),
            )
            const dayStartMinutes = dayStartLocal.getTime() * MILLISECOND

            // Create new entry with adjusted start time
            const adjustedEntry = {
              ...entry,
              originalTimestampStart: entry.timestampStart,
              timestampStart: dayStartMinutes + currentStartHour * HOUR,
            }

            processedEntries.push(adjustedEntry)
            currentStartHour += entry.duration / HOUR
          }
        }
      }
    }

    return processedEntries
  })

  const currentMonth = $derived.by(() => {
    const date = new Date(currentWeekStart / MILLISECOND)
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date)
  })

  // Navigate weeks
  const previousWeek = () => {
    currentWeekStart -= 7 * DAY
    loadTimeEntries()
  }

  const nextWeek = () => {
    currentWeekStart += 7 * DAY
    loadTimeEntries()
  }

  // Filter to show specific weekday for past 3 weeks
  const filterWeekday = (dayIndex: number) => {
    if (filteredWeekday === dayIndex) {
      // If already filtering this day, clear the filter
      filteredWeekday = null
    } else {
      filteredWeekday = dayIndex
    }
    loadTimeEntries()
  }

  // Filter to show specific subcategory
  const filterSubcategory = (subcategory: string) => {
    if (filteredSubcategory === subcategory) {
      // If already filtering this subcategory, clear the filter
      filteredSubcategory = null
    } else {
      filteredSubcategory = subcategory
      if (groupingMode) window.scrollTo({ top: 0 })
    }
    loadTimeEntries()
  }

  // Load time entries for current week or filtered weekday
  const loadTimeEntries = async () => {
    let entries = []

    if (filteredWeekday !== null) {
      // Load entries for the specific day across 3 weeks
      for (let i = 0; i < 3; i++) {
        const weekOffset = i * 7 * DAY
        const dayStart = currentWeekStart - weekOffset + filteredWeekday * DAY
        const dayEnd = dayStart + DAY
        const dayEntries = await db.timeEntries
          .where("timestampStart")
          .between(dayStart, dayEnd, true, false)
          .toArray()
        entries.push(...dayEntries)
      }
    } else {
      // Load entries for the entire week
      const weekEnd = currentWeekStart + 7 * DAY
      entries = await db.timeEntries
        .where("timestampStart")
        .between(currentWeekStart, weekEnd, true, false)
        .toArray()
    }

    // Apply subcategory filter if active
    if (filteredSubcategory !== null) {
      entries = entries.filter((entry) => entry.subcategory === filteredSubcategory)
    }

    timeEntries = entries
  }
  loadTimeEntries()

  $effect(() => {
    console.log("time entries", $state.snapshot(timeEntries))
  })
</script>

<!-- Navigation Header -->
<div class="mb-4 flex items-center justify-between bg-white p-4 shadow-sm">
  <div class="flex items-center gap-2">
    <button
      onclick={previousWeek}
      class="rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600"
    >
      ← Previous
    </button>
    <button
      onclick={() => (groupingMode = !groupingMode)}
      class="rounded px-3 py-1 text-white transition-colors"
      class:bg-green-500={groupingMode}
      class:hover:bg-green-600={groupingMode}
      class:bg-gray-500={!groupingMode}
      class:hover:bg-gray-600={!groupingMode}
    >
      {groupingMode ? "Grouped" : "Group"}
    </button>
  </div>
  <div class="flex flex-col items-center">
    <h1 class="text-xl font-semibold">{currentMonth}</h1>
    {#if filteredSubcategory}
      <div class="flex items-center gap-2 text-sm text-blue-600">
        <span>Filtered: {filteredSubcategory}</span>
        <button onclick={() => filterSubcategory(filteredSubcategory)} class="text-xs underline"
          >clear</button
        >
      </div>
    {/if}
    {#if groupingMode}
      <div class="text-xs text-green-600">Events grouped by category & subcategory</div>
    {/if}
  </div>
  <button onclick={nextWeek} class="rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600">
    Next →
  </button>
</div>

<CalGrid
  {filteredWeekday}
  {currentWeekStart}
  tableHeight="400vh"
  onHeaderClick={(idx) => filterWeekday(filteredWeekday !== null ? filteredWeekday : idx)}
>
  <!-- Cal events -->
  {#each processedEntries as entry (entry.id)}
    {#if entry.duration}
      {@const entryDate = new Date(entry.timestampStart / MILLISECOND)}
      {@const dayStartLocal = new Date(
        entryDate.getFullYear(),
        entryDate.getMonth(),
        entryDate.getDate(),
      )}
      {@const dayStartMinutes = dayStartLocal.getTime() * MILLISECOND}
      {@const localStartHour = (entry.timestampStart - dayStartMinutes) / HOUR}

      {#if filteredWeekday !== null}
        {@const timeDiff = currentWeekStart + filteredWeekday * DAY - entry.timestampStart}
        {@const weekIndex = Math.floor(timeDiff / (7 * DAY))}
        <CalEvent
          startHour={localStartHour}
          dayIndex={weekIndex >= 0 && weekIndex < 3 ? weekIndex : -1}
          duration={entry.duration / HOUR}
          color={getSubcategoryColor(entry.category, entry.subcategory)}
          onclick={() => filterSubcategory(entry.subcategory)}
        >
          <div class="truncate font-semibold">{entry.subcategory}</div>
          <div class="truncate text-xs opacity-75">{entry.category}</div>
        </CalEvent>
      {:else}
        {@const weekStartLocal = new Date(currentWeekStart / MILLISECOND)}
        {@const entryDayStart = new Date(
          entryDate.getFullYear(),
          entryDate.getMonth(),
          entryDate.getDate(),
        )}
        {@const weekDayStart = new Date(
          weekStartLocal.getFullYear(),
          weekStartLocal.getMonth(),
          weekStartLocal.getDate(),
        )}
        {@const daysDiff = Math.round(
          ((entryDayStart.getTime() - weekDayStart.getTime()) * MILLISECOND) / DAY,
        )}
        <CalEvent
          startHour={localStartHour}
          dayIndex={daysDiff}
          duration={entry.duration / HOUR}
          color={getSubcategoryColor(entry.category, entry.subcategory)}
          onclick={() => filterSubcategory(entry.subcategory)}
        >
          <div class="truncate font-semibold">{entry.subcategory}</div>
          <div class="truncate text-xs opacity-75">{entry.category}</div>
        </CalEvent>
      {/if}
    {/if}
  {/each}
</CalGrid>
