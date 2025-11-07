<script module>
  export const tableHeight = "400vh"
  export const headerHeight = "2rem"
  export const labelWidth = "50px"
</script>

<script lang="ts">
  import CalEvent from "./CalEvent.svelte"
  import { db, type TimeEntry } from "$lib/db"
  import {
    getWeekStart,
    nowMinutes,
    formatTimeFromMinutes,
    MILLISECOND,
    HOUR,
    DAY,
  } from "$lib/time"
  import { loadBudgetConfig } from "$lib/budgetManager"
  import { floorTo } from "$lib"

  const startTime = 0
  const endTime = 24

  const locale = navigator.language || "en-US"

  let currentWeekStart = $state(getWeekStart())
  let timeEntries: TimeEntry[] = $state([])
  let budgetConfig = $state(loadBudgetConfig())
  let filteredWeekday: number | null = $state(null)
  let filteredSubcategory: string | null = $state(null)
  let groupingMode = $state(false)

  // Color palette matching budget-generator.js
  const palette = [
    "#3366cc",
    "#dc3912",
    "#ff9900",
    "#109618",
    "#990099",
    "#0099c6",
    "#dd4477",
    "#66aa00",
    "#b82e2e",
    "#316395",
  ]

  // Get category colors
  const getCategoryColor = (category: string) => {
    const categories = Object.keys(budgetConfig)
    const index = categories.indexOf(category)
    return palette[index % palette.length] || "#999999"
  }

  // Generate shades for subcategories
  const getSubcategoryColor = (category: string, subcategory: string) => {
    const baseColor = getCategoryColor(category)
    const subcategories = Object.keys(budgetConfig[category]?.subcategories || {})
    const index = subcategories.indexOf(subcategory)
    const totalSubs = subcategories.length

    // Create lighter/darker shades
    const shade = 0.3 + (index / Math.max(totalSubs - 1, 1)) * 0.4 // 0.3 to 0.7 range
    return adjustColorBrightness(baseColor, shade)
  }

  // Helper to adjust color brightness
  const adjustColorBrightness = (hex: string, factor: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)

    const newR = Math.round(r + (255 - r) * (1 - factor))
    const newG = Math.round(g + (255 - g) * (1 - factor))
    const newB = Math.round(b + (255 - b) * (1 - factor))

    return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`
  }

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
  const days = $derived.by(() => {
    if (filteredWeekday !== null) {
      // Show past 3 weeks for the selected day
      return Array.from({ length: 3 }, (_, i) => {
        const weekOffset = i * 7 * DAY
        const date = new Date((currentWeekStart - weekOffset + filteredWeekday * DAY) / MILLISECOND)
        const dayName = new Intl.DateTimeFormat(locale, { weekday: "short" })
          .format(date)
          .toLowerCase()
        const dayNum = date.getDate()
        const suffix = getDaySuffix(dayNum)
        return `${dayName} ${dayNum}${suffix}`
      })
    }

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date((currentWeekStart + i * DAY) / MILLISECOND)
      const dayName = new Intl.DateTimeFormat(locale, { weekday: "short" })
        .format(date)
        .toLowerCase()
      const dayNum = date.getDate()
      const suffix = getDaySuffix(dayNum)
      return `${dayName} ${dayNum}${suffix}`
    })
  })

  const getDaySuffix = (day: number) => {
    if (day >= 11 && day <= 13) return "th"
    switch (day % 10) {
      case 1:
        return "st"
      case 2:
        return "nd"
      case 3:
        return "rd"
      default:
        return "th"
    }
  }

  const currentMonth = $derived.by(() => {
    const date = new Date(currentWeekStart / MILLISECOND)
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date)
  })

  const hours = $derived(Array.from({ length: endTime - startTime }, (_, i) => startTime + i))

  const formatHour = (h: number) => `${h % 12 || 12} ${h >= 12 ? "pm" : "am"}`

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

<div class="relative h-full w-full">
  <table class="w-full table-fixed border-collapse" style:height={tableHeight}>
    <thead class="sticky top-0 bg-white">
      <tr style:height={headerHeight}>
        <th class="w-[50px] max-w-[50px] min-w-[50px] border border-gray-300"></th>
        {#each days as day, idx}
          <th
            class="cursor-pointer truncate border border-gray-300 px-1 hover:bg-gray-100"
            class:bg-blue-100={filteredWeekday !== null &&
              (filteredWeekday === idx || (filteredWeekday !== null && idx < 3))}
            onclick={() => filterWeekday(filteredWeekday !== null ? filteredWeekday : idx)}
            >{day}</th
          >
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each hours as hour}
        <tr>
          <td class="border border-gray-300 text-center align-top text-sm">
            <span class="inline-block -translate-y-2">{formatHour(hour)}</span>
          </td>
          {#each days as _}
            <td class="border border-gray-300 align-top"></td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

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
</div>
