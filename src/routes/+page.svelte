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

  const budget = loadBudgetConfig()
  let accumulatedTime = $state(Promise.resolve({} as AccumulatedTime))
  let unallocatedTime = $state(0)
  let currentTask = $state("")

  function setState() {
    accumulatedTime = loadWeeklyData().then((data) => accumulateTime(data))
    unallocatedTime = getUnallocatedTime(budget)
    activeTimer().then(res => currentTask = (res?.category ?? "") + (res?.subcategory ?? ""))
  }
  setState()

  async function switchTask(category: string, subcategory: string) {
    await finishTask()
    await startNewTask(category, subcategory)
    setState()
  }
</script>

{#each Object.entries(budget) as [categoryName, category]}
  <LabeledProgress
    spent={accumulatedTime.then((res) => res[categoryName] ?? 0)}
    budget={category.time}
  >
    <h2 class="font-bold">{categoryName}</h2>
  </LabeledProgress>

  {#each Object.entries(category.subcategories) as [subcategoryName, subcategoryBudget]}
    <LabeledProgress
      spent={accumulatedTime.then((res) => res[categoryName + subcategoryName] ?? 0)}
      budget={subcategoryBudget}
      style="cursor-pointer"
      onclick={switchTask.bind(null, categoryName, subcategoryName)}
    >
      {#if currentTask === categoryName + subcategoryName}
        ▶️
      {/if}
      {subcategoryName}
    </LabeledProgress>
  {/each}
{/each}

<LabeledProgress
  spent={accumulatedTime.then((res) => calculateOverage(budget, res))}
  budget={unallocatedTime}
>
  <h2 class="font-bold">Unallocated time</h2>
</LabeledProgress>
