<script lang="ts">
  import { fmtDuration } from "$lib/time"
  import type { Snippet } from "svelte"
  import type { MouseEventHandler } from "svelte/elements"

  interface ProgressProps {
    children: Snippet<[]>
    spent: number
    // Spent minutes of the current timer, to appear in blue
    inProgress: number
    budget: number
    categoryBudget: number
    unallocatedBudget: number
    style?: string
    onclick?: MouseEventHandler<HTMLDivElement>
  }

  let {
    children,
    spent,
    budget,
    style = "",
    onclick,
    inProgress,
    categoryBudget,
    unallocatedBudget,
  }: ProgressProps = $props()

  // It may seem odd to calculate budget by adding spent, but that budget time has already been spent by this task, I need to know the additional time
  // Out of context, this might seem like as you increase `spent`, your budget also increases, but in actuall application `budget` parameter will also go down
  const totalBudget = $derived(
    spent > budget
      ? spent > budget + categoryBudget
        ? spent + unallocatedBudget
        : spent + categoryBudget
      : budget,
  )
</script>

<div class={"relative w-full " + style} {onclick} role={onclick ? "button" : undefined}>
  <div class="progress-bar relative flex h-8 w-full">
    <div
      class="progress spent"
      class:!rounded-r-none={inProgress > 0}
      style:width={(spent / totalBudget) * 100 + "%"}
    ></div>
    <div
      class="progress current"
      class:!rounded-l-none={inProgress > 0}
      style:width={(inProgress / totalBudget) * 100 + "%"}
    ></div>

    <!-- Dividers -->
    <div class="absolute top-0 left-0 flex h-full w-full">
      {#if spent > budget}
        <div
          class="h-full border-r-4 border-[#f97316]"
          style:width={(budget / totalBudget) * 100 + "%"}
        ></div>
      {/if}
      {#if spent > budget + categoryBudget}
        <div
          class="h-full border-r-4 border-[#ef4444]"
          style:width={(categoryBudget / totalBudget) * 100 + "%"}
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
      {spent} / {totalBudget}
      <!-- {fmtDuration(budget - spent)} / {fmtDuration(budget)} -->
    </div>
  </div>
</div>

<style>
  .progress-bar {
    transition: all 0.3s ease-in-out;
    background-color: #e5e7eb;
    border-radius: 0.375rem;
  }

  .progress {
    border-radius: 0.375rem;
    transition: width 0.3s ease-in-out;
    height: 100%;
  }

  .spent {
    background-color: #10b981;
  }

  .current {
    background-color: #3b82f6;
  }
</style>
