<script lang="ts">
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

  const startTime = 0
  const endTime = 24

  const locale = navigator.language || "en-US"

  let currentWeekStart = $state(getWeekStart())
  let timeEntries: TimeEntry[] = $state([])
  let budgetConfig = $state(loadBudgetConfig())

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

  const days = $derived(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(currentWeekStart / MILLISECOND + (i * DAY) / MILLISECOND)
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

  // Load time entries for current week
  const loadTimeEntries = async () => {
    const weekEnd = currentWeekStart + 7 * DAY
    timeEntries = await db.timeEntries
      .where("timestampStart")
      .between(currentWeekStart, weekEnd, true, false)
      .toArray()
  }

  // Get entries for a specific day and hour
  const getEntriesForSlot = (dayIndex: number, hour: number) => {
    const dayStart = currentWeekStart + dayIndex * DAY
    const slotStart = dayStart + hour * HOUR
    const slotEnd = slotStart + HOUR

    return timeEntries.filter((entry) => {
      const entryStart = entry.timestampStart
      const entryEnd = entry.duration ? entryStart + entry.duration : nowMinutes()

      // Check if entry overlaps with this hour slot
      return entryStart < slotEnd && entryEnd > slotStart
    })
  }

  // Calculate position and height for an entry within an hour slot
  const getEntryStyle = (entry: TimeEntry, dayIndex: number, hour: number) => {
    const dayStart = currentWeekStart + dayIndex * DAY
    const slotStart = dayStart + hour * HOUR
    const slotEnd = slotStart + HOUR

    const entryStart = Math.max(entry.timestampStart, slotStart)
    const entryEnd = Math.min(
      entry.duration ? entry.timestampStart + entry.duration : nowMinutes(),
      slotEnd,
    )

    const startPercent = ((entryStart - slotStart) / HOUR) * 100
    const heightPercent = ((entryEnd - entryStart) / HOUR) * 100

    const backgroundColor = getSubcategoryColor(entry.category, entry.subcategory)

    return {
      position: "absolute",
      top: `${startPercent}%`,
      height: `${heightPercent}%`,
      left: "2px",
      right: "2px",
      backgroundColor,
      border: "1px solid rgba(0,0,0,0.2)",
      borderRadius: "2px",
      fontSize: "10px",
      padding: "1px",
      overflow: "hidden",
      zIndex: 1,
    }
  }

  // Load initial data
  loadTimeEntries()
</script>

<div class="h-full w-full">
  <!-- Navigation Header -->
  <div class="mb-4 flex items-center justify-between bg-white p-4 shadow-sm">
    <button
      onclick={previousWeek}
      class="rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600"
    >
      ← Previous
    </button>
    <h1 class="text-xl font-semibold">{currentMonth}</h1>
    <button onclick={nextWeek} class="rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600">
      Next →
    </button>
  </div>

  <div class="relative">
    <table class="h-[200vh] w-full table-fixed border-collapse">
      <thead>
        <tr>
          <th class="w-[50px] max-w-[50px] min-w-[50px] border border-gray-300"></th>
          {#each days() as day}
            <th class="truncate border border-gray-300 px-1">{day}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each hours as hour}
          <tr style="height: {100 / 24}vh;">
            <td class="border border-gray-300 text-center align-top text-sm">
              <span class="inline-block -translate-y-2">{formatHour(hour)}</span>
            </td>
            {#each days() as _, dayIndex}
              <td class="relative border border-gray-300 align-top">
                {#each getEntriesForSlot(dayIndex, hour) as entry}
                  <div
                    style={Object.entries(getEntryStyle(entry, dayIndex, hour))
                      .map(([k, v]) => `${k}: ${v}`)
                      .join("; ")}
                  >
                    <div class="truncate font-semibold">{entry.subcategory}</div>
                    <div class="truncate text-xs opacity-75">{entry.category}</div>
                  </div>
                {/each}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
