<script lang="ts">
  import { fmtDuration } from "$lib/time"
  import type { Snippet } from "svelte"
  import type { MouseEventHandler } from "svelte/elements"

  interface ProgressProps {
    children: Snippet<[]>
    spent: number
    budget: number
    style?: string
    onclick?: MouseEventHandler<HTMLDivElement>
    oncontextmenu?: MouseEventHandler<HTMLDivElement>
    // Multi-bar mode: provide totalCategorySpillover to activate.
    // categorySpilloverForThis: yellow amount for this subcategory (proportionally allocated by parent).
    // remainingCategorySpillover: global remaining pool (extends bar as gray in yellow region).
    // remainingUnallocated: extends bar as gray ONLY when orange > 0 (category pool fully exhausted).
    totalCategorySpillover?: number
    categorySpilloverForThis?: number
    remainingCategorySpillover?: number
    remainingUnallocated?: number
    overlayStart?: number
  }

  let {
    children,
    spent,
    budget,
    style = "",
    onclick,
    oncontextmenu,
    totalCategorySpillover,
    categorySpilloverForThis = 0,
    remainingCategorySpillover = 0,
    remainingUnallocated = 0,
    overlayStart,
  }: ProgressProps = $props()

  let isMultiBar = $derived(totalCategorySpillover !== undefined)

  // Single-bar: green fill percentage
  let singlePct = $derived(budget > 0 ? (spent / budget) * 100 : 100)

  let overage = $derived(Math.max(0, spent - budget))
  let yellowAmount = $derived(categorySpilloverForThis)
  let orangeAmount = $derived(Math.max(0, overage - yellowAmount))

  // Bar width:
  // - Under budget: just the budget (standard)
  // - Yellow region: spent + remaining pool = budget + total pool (stable)
  // - Orange region: spent + remaining unallocated (stable, shows gray = remaining unallocated)
  let totalBarUnits = $derived.by(() => {
    if (!isMultiBar) return budget
    if (spent <= budget) return budget
    return spent + remainingCategorySpillover + (orangeAmount > 0 ? remainingUnallocated : 0)
  })

  let greenPct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) {
      if (budget === 0) return 100
      const pct = 10000 / singlePct
      return pct < 100 ? pct : singlePct
    }
    return (Math.min(spent, budget) / totalBarUnits) * 100
  })

  let yellowPct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) {
      if (budget === 0) return spent > 0 ? 100 : 0
      return Math.max(0, 100 - 10000 / singlePct)
    }
    return (yellowAmount / totalBarUnits) * 100
  })

  let orangePct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return 0
    return (orangeAmount / totalBarUnits) * 100
  })

  // totalBarUnits is stable (constant as spent increases), so this decreases by exactly 1 per unit spent
  let labelRemaining = $derived(
    isMultiBar && spent > budget
      ? totalBarUnits - spent == 0
        ? -spent * (orangePct / 100)
        : totalBarUnits - spent
      : budget - spent,
  )

  let overlayTotalUnits = $derived(isMultiBar ? totalBarUnits : Math.max(budget, spent))

  // Overlay: convert start/length from unit-space to percentage of totalBarUnits
  let overlayLeftPct = $derived(
    overlayStart !== undefined && overlayTotalUnits > 0
      ? Math.min(100, Math.max(0, (overlayStart / overlayTotalUnits) * 100))
      : 0,
  )
</script>

<div
  class={"relative mb-1.25 w-full " + style}
  {onclick}
  {oncontextmenu}
  role={onclick ? "button" : undefined}
>
  <div class="h-8 w-full overflow-hidden rounded-md bg-gray-200">
    <div class="flex h-full">
      <div
        class="h-full bg-emerald-500 transition-all duration-300"
        style="width: {greenPct}%"
      ></div>
      <div
        class="h-full bg-yellow-400 transition-all duration-300"
        style="width: {yellowPct}%"
      ></div>
      <div
        class="h-full bg-orange-400 transition-all duration-300"
        style="width: {orangePct}%"
      ></div>
    </div>
  </div>

  {#if overlayStart !== undefined}
    <div
      class="pointer-events-none absolute inset-y-0 w-0.5 bg-black transition-all duration-300"
      style="left: {overlayLeftPct}%;"
    ></div>
  {/if}

  <div
    class="pointer-events-none absolute inset-0 flex items-center justify-between px-3 font-medium text-gray-800"
  >
    <div class="flex-shrink-0">
      {@render children?.()}
    </div>
    <div class="flex-shrink-0">
      {fmtDuration(labelRemaining)} / {fmtDuration(budget)}
    </div>
  </div>
</div>
