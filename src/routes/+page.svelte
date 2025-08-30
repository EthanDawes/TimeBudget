<script lang="ts">
  import {
    accumulateTime,
    calculateOverage,
    finishTask,
    getUnallocatedTime,
    loadBudgetConfig,
    loadWeeklyData,
    startNewTask,
  } from "$lib/budgetManager"
  import LabeledProgress from "./LabeledProgress.svelte"

  const budget = loadBudgetConfig()
  let accumulatedTime = $state(loadWeeklyData().then((data) => accumulateTime(data)))
  let unallocatedTime = $state(getUnallocatedTime(budget))

  function switchTask(category: string, subcategory: string) {
    finishTask()
    startNewTask(category, subcategory)
    accumulatedTime = loadWeeklyData().then((data) => accumulateTime(data))
    unallocatedTime = getUnallocatedTime(budget)
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
