<script lang="ts">
  import {
    accumulateTime,
    activeTimer,
    calculateOverage,
    finishTask,
    getUnallocatedTime,
    loadBudgetConfig,
    loadWeeklyData,
    startNewTask,
    type AccumulatedTime,
  } from "$lib/budgetManager"
  import LabeledProgress from "./LabeledProgress.svelte"
  import { resolve } from "$app/paths"
  import { fmtDuration, nowMinutes } from "$lib/time"
  import type { TimeEntry } from "$lib/db"

  const budget = loadBudgetConfig()
  let accumulatedTime = $state({} as AccumulatedTime)
  let unallocatedTime = $state(0)
  let currentTask = $state<TimeEntry>()

  function setState() {
    loadWeeklyData().then((data) => (accumulatedTime = accumulateTime(data)))
    unallocatedTime = getUnallocatedTime(budget)
    activeTimer().then((res) => (currentTask = res))
  }
  setState()

  async function switchTask(category: string, subcategory: string) {
    await finishTask()
    await startNewTask(category, subcategory)
    setState()
  }
</script>

{#if currentTask}
  <p class="pb-1.5">
    {currentTask.subcategory} has been running for
    {fmtDuration(nowMinutes() - currentTask.timestampStart)}. Incorrect?
    <button class="border">Split among multiple categories</button>
  </p>
{/if}

{#each Object.entries(budget) as [categoryName, category]}
  <LabeledProgress spent={accumulatedTime[categoryName] ?? 0} budget={category.time}>
    <h2 class="font-bold">{categoryName}</h2>
  </LabeledProgress>

  {#each Object.entries(category.subcategories) as [subcategoryName, subcategoryBudget]}
    <LabeledProgress
      spent={accumulatedTime[categoryName + subcategoryName] ?? 0}
      budget={subcategoryBudget}
      style="cursor-pointer"
      onclick={switchTask.bind(null, categoryName, subcategoryName)}
    >
      {#if currentTask?.category === categoryName && currentTask?.subcategory === subcategoryName}
        ▶️
      {/if}
      {subcategoryName}
    </LabeledProgress>
  {/each}
{/each}

<LabeledProgress spent={calculateOverage(budget, accumulatedTime)} budget={unallocatedTime}>
  <h2 class="font-bold">Unallocated time</h2>
</LabeledProgress>

<div class="text-center">
  <a href={resolve("/settings")}>
    <button class="border">Settings</button>
  </a>
  <button class="border">Export</button>
</div>
