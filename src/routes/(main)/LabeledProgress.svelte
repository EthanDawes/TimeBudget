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
    // categorySpilloverForThis: yellow amount for this subcategory (proportionally allocated by parent).
    // remainingCategorySpillover: global remaining pool (extends bar as gray in yellow region).
    // remainingUnallocated: extends bar as gray ONLY when orange > 0 (category pool fully exhausted).
    totalCategorySpillover?: number
    categorySpilloverForThis?: number
    remainingCategorySpillover?: number
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
    remainingCategorySpillover = 0,
    remainingUnallocated = 0,
  }: ProgressProps = $props()

  let isMultiBar = $derived(totalCategorySpillover !== undefined)

  // Single-bar: green fill percentage
  let singlePct = $derived(budget > 0 ? Math.min(100, (spent / budget) * 100) : 0)

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

  // totalBarUnits is stable (constant as spent increases), so this decreases by exactly 1 per unit spent
  let labelRemaining = $derived(isMultiBar && spent > budget ? totalBarUnits - spent : budget - spent)
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
