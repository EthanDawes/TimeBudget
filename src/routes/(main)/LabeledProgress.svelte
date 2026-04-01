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
    // Multi-bar mode props
    allocatedSpillover?: number        // yellow/orange threshold; full spillover unless split-evenly applies
    remainingCategorySpillover?: number // empty space in yellow territory (global remaining spillover)
    remainingUnallocated?: number       // empty space in orange territory
  }

  let {
    children,
    spent,
    budget,
    style = "",
    onclick,
    allocatedSpillover,
    remainingCategorySpillover = 0,
    remainingUnallocated = 0,
  }: ProgressProps = $props()

  let isMultiBar = $derived(allocatedSpillover !== undefined)
  let overage = $derived(Math.max(0, spent - budget))

  // Single-bar percentage
  let singlePct = $derived(budget > 0 ? Math.min(100, (spent / budget) * 100) : 0)

  // Total bar width in time units
  let totalBarUnits = $derived.by(() => {
    if (!isMultiBar) return budget
    if (spent <= budget) return budget
    if (overage <= allocatedSpillover!) {
      // Yellow territory: extend by remaining global spillover
      return spent + remainingCategorySpillover
    } else {
      // Orange territory: extend by remaining unallocated
      return spent + remainingUnallocated
    }
  })

  let greenPct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return singlePct
    return (Math.min(spent, budget) / totalBarUnits) * 100
  })

  let yellowPct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return 0
    return (Math.min(overage, allocatedSpillover!) / totalBarUnits) * 100
  })

  let orangePct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return 0
    return (Math.max(0, overage - allocatedSpillover!) / totalBarUnits) * 100
  })

  // Label: when in spillover, show remaining/total of this subcat's allocated spillover
  // (negative means overdraft into unallocated)
  let labelRemaining = $derived.by(() => {
    if (!isMultiBar || overage === 0) return budget - spent
    return budget + allocatedSpillover! - spent
  })

  let labelTotal = $derived.by(() => {
    if (!isMultiBar || overage === 0) return budget
    return allocatedSpillover!
  })
</script>

<div class={"relative w-full " + style} {onclick} role={onclick ? "button" : undefined}>
  <div class="h-8 w-full overflow-hidden rounded-md bg-gray-200">
    <div class="flex h-full">
      <div
        class="h-full bg-emerald-500 transition-all duration-300"
        style="width: {greenPct}%"
      ></div>
      {#if isMultiBar}
        <div
          class="h-full bg-yellow-400 transition-all duration-300"
          style="width: {yellowPct}%"
        ></div>
        <div
          class="h-full bg-orange-400 transition-all duration-300"
          style="width: {orangePct}%"
        ></div>
      {/if}
    </div>
  </div>
  <div
    class="pointer-events-none absolute inset-0 flex items-center justify-between px-3 font-medium text-gray-800"
  >
    <div class="flex-shrink-0">
      {@render children?.()}
    </div>
    <div class="flex-shrink-0">
      {fmtDuration(labelRemaining)} / {fmtDuration(labelTotal)}
    </div>
  </div>
</div>
