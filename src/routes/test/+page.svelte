<script lang="ts">
  import LabeledProgress from "../(main)/LabeledProgress.svelte"

  let categoryBudget = $state(15)
  let unallocatedBudget = $state(60)
  let spentA = $state(0)
  let budgetA = $state(5)
  let spentB = $state(0)
  let budgetB = $state(5)

  let totalCategorySpillover = $derived(categoryBudget - (budgetA + budgetB))

  let categoryOverage = $derived(Math.max(0, spentA - budgetA) + Math.max(0, spentB - budgetB))

  let remainingCategorySpillover = $derived(Math.max(0, totalCategorySpillover - categoryOverage))

  // Amount that has spilled beyond the category buffer into unallocated time
  let unallocatedSpent = $derived(Math.max(0, categoryOverage - totalCategorySpillover))
</script>

<svelte:head>
  <title>Test Page</title>
</svelte:head>

<div class="flex flex-col gap-6 p-4">
  <h1 class="text-2xl font-bold">LabeledProgress Test</h1>

  <div class="grid grid-cols-2 gap-4 rounded border p-4">
    <h2 class="col-span-2 text-lg font-semibold">Inputs (minutes)</h2>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Category "test" total budget</span>
      <input type="number" bind:value={categoryBudget} class="rounded border px-2 py-1" />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Unallocated budget</span>
      <input type="number" bind:value={unallocatedBudget} class="rounded border px-2 py-1" />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Subcategory "a" spent</span>
      <input type="number" bind:value={spentA} class="rounded border px-2 py-1" />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Subcategory "a" budget</span>
      <input type="number" bind:value={budgetA} class="rounded border px-2 py-1" />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Subcategory "b" spent</span>
      <input type="number" bind:value={spentB} class="rounded border px-2 py-1" />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Subcategory "b" budget</span>
      <input type="number" bind:value={budgetB} class="rounded border px-2 py-1" />
    </label>

    <div class="col-span-2 mt-2 text-sm text-gray-600">
      totalCategorySpillover: {totalCategorySpillover} &nbsp;|&nbsp; categoryOverage: {categoryOverage}
      &nbsp;|&nbsp; remainingCategorySpillover: {remainingCategorySpillover}
    </div>
  </div>

  <div class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Category: test</h2>

    <LabeledProgress
      spent={spentA}
      budget={budgetA}
      {totalCategorySpillover}
      {remainingCategorySpillover}
    >
      a
    </LabeledProgress>

    <LabeledProgress
      spent={spentB}
      budget={budgetB}
      {totalCategorySpillover}
      {remainingCategorySpillover}
    >
      b
    </LabeledProgress>

    <h2 class="text-lg font-semibold">Unallocated time</h2>

    <LabeledProgress spent={unallocatedSpent} budget={unallocatedBudget}>
      Unallocated time
    </LabeledProgress>
  </div>
</div>
