<script lang="ts">
  import { fmtDuration } from "$lib/time"
  import {
    accumulateTime,
    calculateOverage,
    getUnallocatedTime,
    loadBudgetConfig,
    loadWeeklyData,
  } from "$lib/timeManager"
  import LabeledProgress from "./labeledProgress.svelte"

  const budget = loadBudgetConfig()
  const accumulatedTime = loadWeeklyData().then((data) => accumulateTime(data))
  const unallocatedTime = getUnallocatedTime(budget)
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
