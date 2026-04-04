<script lang="ts">
  import LabeledProgress from "../(main)/LabeledProgress.svelte"

  let categoryBudget = $state(15)
  let unallocatedBudget = $state(60)
  let spentA = $state(0)
  let budgetA = $state(5)
  let spentB = $state(0)
  let budgetB = $state(5)

  let spentC = $state(0)
  let budgetC = $state(5)

  let totalCategorySpillover = $derived(categoryBudget - (budgetA + budgetB))

  let overageA = $derived(Math.max(0, spentA - budgetA))
  let overageB = $derived(Math.max(0, spentB - budgetB))
  let totalSubcategoryOverage = $derived(overageA + overageB)

  // Proportional allocation of the shared category pool across subcategories
  let poolAllocated = $derived(Math.min(totalSubcategoryOverage, totalCategorySpillover))
  let categorySpilloverForA = $derived(
    totalSubcategoryOverage > 0 ? (overageA / totalSubcategoryOverage) * poolAllocated : 0,
  )
  let categorySpilloverForB = $derived(
    totalSubcategoryOverage > 0 ? (overageB / totalSubcategoryOverage) * poolAllocated : 0,
  )

  let remainingCategorySpillover = $derived(
    Math.max(0, totalCategorySpillover - totalSubcategoryOverage),
  )

  // Unallocated time consumed by overages that exceeded the category pool
  let unallocatedConsumed = $derived(Math.max(0, totalSubcategoryOverage - totalCategorySpillover))
  let remainingUnallocated = $derived(Math.max(0, unallocatedBudget - unallocatedConsumed))

  // Unallocated bar: shows how much unallocated time has been consumed
  let unallocatedSpent = $derived(unallocatedConsumed)
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
      totalCategorySpillover: {totalCategorySpillover} &nbsp;|&nbsp; remainingCategorySpillover:
      {remainingCategorySpillover} &nbsp;|&nbsp; spilloverForA: {categorySpilloverForA.toFixed(2)}
      &nbsp;|&nbsp; spilloverForB: {categorySpilloverForB.toFixed(2)} &nbsp;|&nbsp; remainingUnallocated:
      {remainingUnallocated}
    </div>
  </div>

  <div class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Category: test</h2>

    <LabeledProgress
      spent={spentA}
      budget={budgetA}
      {totalCategorySpillover}
      categorySpilloverForThis={categorySpilloverForA}
      {remainingCategorySpillover}
      {remainingUnallocated}
      overlayStart={3}
    >
      a
    </LabeledProgress>

    <LabeledProgress
      spent={spentB}
      budget={budgetB}
      {totalCategorySpillover}
      categorySpilloverForThis={categorySpilloverForB}
      {remainingCategorySpillover}
      {remainingUnallocated}
    >
      b
    </LabeledProgress>

    <h2 class="text-lg font-semibold">Unallocated time</h2>

    <LabeledProgress spent={unallocatedSpent} budget={unallocatedBudget}>
      Unallocated time
    </LabeledProgress>
  </div>

  <!-- Single bar -->
  <div class="grid grid-cols-2 gap-4 rounded border p-4">
    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">"c" spent</span>
      <input type="number" bind:value={spentC} class="rounded border px-2 py-1" />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">"c" allocated</span>
      <input type="number" bind:value={budgetC} class="rounded border px-2 py-1" />
    </label>
  </div>

  <LabeledProgress spent={spentC} budget={budgetC} overlayStart={3}>c</LabeledProgress>
</div>
