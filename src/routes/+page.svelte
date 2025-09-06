<script lang="ts">
  import {
    accumulateTime,
    activeTimer,
    calculateCategoryOverage,
    calculateOverage,
    finishTask,
    getUnallocatedTime,
    loadBudgetConfig,
    loadWeeklyBudgetConfig,
    saveWeeklyBudgetConfig,
    loadWeeklyData,
    startNewTask,
    type AccumulatedTime,
    type BudgetConfig,
  } from "$lib/budgetManager"
  import { exportSpentTime } from "$lib/db"
  import LabeledProgress from "./LabeledProgress.svelte"
  import ReallocationModal from "./ReallocationModal.svelte"
  import CategoryList from "./CategoryList.svelte"
  import { resolve } from "$app/paths"
  import { fmtDuration, nowMinutes } from "$lib/time"
  import type { TimeEntry } from "$lib/db"

  let budget = $state<BudgetConfig>(loadWeeklyBudgetConfig())
  let accumulatedTime = $state({} as AccumulatedTime)
  let categoryOverages = $state({} as Record<string, number>)
  let unallocatedTime = $state(0)
  let currentTask = $state<TimeEntry>()
  let showReallocationModal = $state(false)

  function setState() {
    loadWeeklyData().then((data) => {
      accumulatedTime = accumulateTime(data)
      categoryOverages = calculateCategoryOverage(budget, accumulatedTime)
    })
    unallocatedTime = getUnallocatedTime(budget)
    activeTimer().then((res) => (currentTask = res))
  }
  setState()

  async function switchTask(category: string, subcategory: string) {
    await finishTask()
    await startNewTask(category, subcategory)
    setState()
  }

  function handleReallocation(newBudget: BudgetConfig) {
    budget = newBudget
    saveWeeklyBudgetConfig(newBudget)
    setState() // Refresh the accumulated time and overages
  }
</script>

{#if currentTask}
  <p class="flex justify-around pb-1.5">
    {currentTask.subcategory}
    {fmtDuration(nowMinutes() - currentTask.timestampStart)}
    <button class="border">Split time</button>
    <button class="border" onclick={() => (showReallocationModal = true)}>Realloc</button>
  </p>
{/if}

<CategoryList {budget} {accumulatedTime} {currentTask} onItemClick={switchTask} />

<ReallocationModal
  open={showReallocationModal}
  {budget}
  {accumulatedTime}
  onClose={() => (showReallocationModal = false)}
  onRealloc={handleReallocation}
/>

<LabeledProgress spent={calculateOverage(budget, accumulatedTime)} budget={unallocatedTime}>
  <h2 class="font-bold">Unallocated time</h2>
</LabeledProgress>

<div class="text-center">
  <a href={resolve("/settings")}>
    <button class="border">Settings</button>
  </a>
  <button class="border" onclick={exportSpentTime}>Export</button>
</div>
