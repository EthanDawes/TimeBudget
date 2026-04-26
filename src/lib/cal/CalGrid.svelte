<script module>
  export const headerHeight = "2rem"
  export const labelWidth = "50px"
</script>

<script lang="ts">
  import { MILLISECOND, DAY } from "$lib/time"
  import { setContext, type Snippet } from "svelte"

  const startTime = 0
  const endTime = 24
  const locale = navigator.language || "en-US"

  interface CalGridProps {
    filteredWeekday?: number | null
    currentWeekStart: number
    // css height
    tableHeight: string
    onHeaderClick?: (weekdayIdx: number) => void
    children?: Snippet
  }

  let {
    filteredWeekday = null,
    currentWeekStart,
    tableHeight,
    onHeaderClick,
    children,
  }: CalGridProps = $props()

  setContext("tableHeight", tableHeight)

  const hours = $derived(Array.from({ length: endTime - startTime }, (_, i) => startTime + i))
  const formatHour = (h: number) => `${h % 12 || 12} ${h >= 12 ? "pm" : "am"}`

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

  function getDaySuffix(day: number) {
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
</script>

<div class="relative h-full w-full">
  <table class="w-full table-fixed border-collapse" style:height={tableHeight}>
    <thead class="sticky top-0 z-50 bg-white">
      <tr style:height={headerHeight}>
        <th class="w-[50px] max-w-[50px] min-w-[50px] border border-gray-300"></th>
        {#each days as day, idx}
          <th
            class="cursor-pointer truncate border border-gray-300 px-1 hover:bg-gray-100"
            class:bg-blue-100={filteredWeekday !== null &&
              (filteredWeekday === idx || (filteredWeekday !== null && idx < 3))}
            onclick={onHeaderClick?.bind(null, idx)}>{day}</th
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

  {@render children?.()}
</div>
