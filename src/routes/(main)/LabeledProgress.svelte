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
    // Multi-bar mode: provide both to show yellow/orange overage segments
    totalCategorySpillover?: number
    remainingCategorySpillover?: number
  }

  let {
    children,
    spent,
    budget,
    style = "",
    onclick,
    totalCategorySpillover,
    remainingCategorySpillover = 0,
  }: ProgressProps = $props()

  let isMultiBar = $derived(totalCategorySpillover !== undefined)

  // Single-bar: green fill percentage
  let singlePct = $derived(budget > 0 ? Math.min(100, (spent / budget) * 100) : 0)

  // Multi-bar segment percentages
  let totalBarUnits = $derived.by(() => {
    if (!isMultiBar) return budget
    if (spent < budget) return budget
    return spent + remainingCategorySpillover
  })

  let greenPct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return singlePct
    return (Math.min(spent, budget) / totalBarUnits) * 100
  })

  let yellowPct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return 0
    const overage = Math.max(0, spent - budget)
    return (Math.min(overage, totalCategorySpillover!) / totalBarUnits) * 100
  })

  let orangePct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return 0
    const overage = Math.max(0, spent - budget)
    return (Math.max(0, overage - totalCategorySpillover!) / totalBarUnits) * 100
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
      {fmtDuration(budget - spent)} / {fmtDuration(budget)}
    </div>
  </div>
</div>
