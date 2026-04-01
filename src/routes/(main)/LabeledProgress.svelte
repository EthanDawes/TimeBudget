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
    // Multi-bar mode: provide totalCategorySpillover to activate.
    // categorySpilloverForThis: how much of this subcategory's overage is covered by the
    //   category pool (yellow). Parent computes this proportionally across siblings.
    // remainingUnallocated: extends the bar as gray space to show available unallocated time.
    totalCategorySpillover?: number
    categorySpilloverForThis?: number
    remainingUnallocated?: number
  }

  let {
    children,
    spent,
    budget,
    style = "",
    onclick,
    totalCategorySpillover,
    categorySpilloverForThis = 0,
    remainingUnallocated = 0,
  }: ProgressProps = $props()

  let isMultiBar = $derived(totalCategorySpillover !== undefined)

  // Single-bar: green fill percentage
  let singlePct = $derived(budget > 0 ? Math.min(100, (spent / budget) * 100) : 0)

  let overage = $derived(Math.max(0, spent - budget))
  let yellowAmount = $derived(categorySpilloverForThis)
  let orangeAmount = $derived(Math.max(0, overage - yellowAmount))

  let totalBarUnits = $derived.by(() => {
    if (!isMultiBar) return budget
    if (spent <= budget) return budget
    return Math.max(spent, budget + yellowAmount) + remainingUnallocated
  })

  let greenPct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return singlePct
    return (Math.min(spent, budget) / totalBarUnits) * 100
  })

  let yellowPct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return 0
    return (yellowAmount / totalBarUnits) * 100
  })

  let orangePct = $derived.by(() => {
    if (!isMultiBar || totalBarUnits === 0) return 0
    return (orangeAmount / totalBarUnits) * 100
  })

  // Label: remaining time considering all pools (no negatives in multi-bar overage)
  let labelRemaining = $derived.by(() => {
    if (!isMultiBar || spent <= budget) return budget - spent
    return Math.max(0, budget + yellowAmount + remainingUnallocated - spent)
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
      {fmtDuration(labelRemaining)} / {fmtDuration(budget)}
    </div>
  </div>
</div>
