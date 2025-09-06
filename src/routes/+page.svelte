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
    getAvailableTime,
    reallocateTime,
    validateReallocation,
    type AccumulatedTime,
    type BudgetConfig,
  } from "$lib/budgetManager"
  import { exportSpentTime } from "$lib/db"
  import LabeledProgress from "./LabeledProgress.svelte"
  import { resolve } from "$app/paths"
  import { fmtDuration, nowMinutes, parseTimeString } from "$lib/time"
  import type { TimeEntry } from "$lib/db"

  let budget = $state<BudgetConfig>(loadWeeklyBudgetConfig())
  let accumulatedTime = $state({} as AccumulatedTime)
  let categoryOverages = $state({} as Record<string, number>)
  let unallocatedTime = $state(0)
  let currentTask = $state<TimeEntry>()
  let showReallocationMode = $state(false)
  let sourceSelection = $state<{ category: string; subcategory?: string } | null>(null)
  let targetSelection = $state<{ category: string; subcategory?: string } | null>(null)
  let reallocationAmount = $state(0)
  let reallocationAmountText = $state("")

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

  function handleReallocationModeToggle() {
    showReallocationMode = !showReallocationMode
    if (!showReallocationMode) {
      // Reset selections when canceling
      sourceSelection = null
      targetSelection = null
      reallocationAmount = 0
      reallocationAmountText = ""
    }
  }

  function handleCategoryClick(category: string, subcategory?: string) {
    if (!showReallocationMode) {
      // Normal timer switching behavior
      if (subcategory) {
        switchTask(category, subcategory)
      }
      return
    }

    // Reallocation mode behavior
    const availableTime = subcategory
      ? getAvailableTime(budget, accumulatedTime, category, subcategory)
      : getAvailableTime(budget, accumulatedTime, category, null)

    if (availableTime <= 0) return // Can't select if no time available

    const selection = { category, subcategory }

    if (!sourceSelection) {
      sourceSelection = selection
    } else if (
      !targetSelection &&
      (sourceSelection.category !== category || sourceSelection.subcategory !== subcategory)
    ) {
      targetSelection = selection
    }
  }

  function commitReallocation() {
    if (!sourceSelection || !targetSelection || reallocationAmount <= 0) return

    try {
      const newBudget = reallocateTime(
        budget,
        sourceSelection.category,
        sourceSelection.subcategory || null,
        targetSelection.category,
        targetSelection.subcategory || null,
        reallocationAmount,
      )

      budget = newBudget
      saveWeeklyBudgetConfig(newBudget)
      setState()

      // Reset reallocation mode
      handleReallocationModeToggle()
    } catch (error) {
      console.error("Error reallocating time:", error)
    }
  }

  function updateAmountFromText() {
    try {
      const parsed = parseTimeString(reallocationAmountText)
      reallocationAmount = parsed
    } catch {
      // Invalid format, keep current amount
    }
  }

  function updateTextFromAmount() {
    const hours = Math.floor(reallocationAmount / 60)
    const minutes = reallocationAmount % 60
    let text = ""
    if (hours > 0) text += hours + "h "
    if (minutes > 0 || hours === 0) text += minutes + "m"
    reallocationAmountText = text.trim()
  }

  // Update slider when text changes
  $effect(() => {
    updateAmountFromText()
  })

  // Update text when slider changes
  $effect(() => {
    updateTextFromAmount()
  })

  // Calculate max slider value based on source selection
  let maxReallocationAmount = $derived.by(() => {
    if (!sourceSelection) return 0
    if (sourceSelection.subcategory) {
      return getAvailableTime(
        budget,
        accumulatedTime,
        sourceSelection.category,
        sourceSelection.subcategory,
      )
    } else {
      return getAvailableTime(budget, accumulatedTime, sourceSelection.category, null)
    }
  })

  // Calculate preview budget
  let previewBudget = $derived.by(() => {
    if (!sourceSelection || !targetSelection || reallocationAmount <= 0) {
      return budget
    }

    try {
      return reallocateTime(
        budget,
        sourceSelection.category,
        sourceSelection.subcategory || null,
        targetSelection.category,
        targetSelection.subcategory || null,
        reallocationAmount,
      )
    } catch {
      return budget
    }
  })
</script>

{#if showReallocationMode}
  <div class="fixed top-0 right-0 left-0 z-50 border-b bg-white p-4 shadow-lg">
    <div class="mx-auto max-w-4xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">Reallocate Time</h3>
        <div class="flex space-x-2">
          <button
            class="rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50"
            onclick={commitReallocation}
            disabled={!sourceSelection || !targetSelection || reallocationAmount <= 0}
          >
            Commit
          </button>
          <button class="rounded border px-3 py-1" onclick={handleReallocationModeToggle}>
            Cancel
          </button>
        </div>
      </div>

      <div class="flex items-center space-x-4">
        <div class="flex-1">
          <input
            type="range"
            min="0"
            max={maxReallocationAmount}
            bind:value={reallocationAmount}
            class="w-full"
          />
        </div>
        <input
          type="text"
          bind:value={reallocationAmountText}
          placeholder="1h 30m"
          class="w-24 rounded border px-3 py-1 text-center"
        />
      </div>

      {#if sourceSelection || targetSelection}
        <div class="mt-2 text-sm text-gray-600">
          {#if sourceSelection}
            From: {sourceSelection.category}{sourceSelection.subcategory
              ? ` → ${sourceSelection.subcategory}`
              : ""}
          {/if}
          {#if targetSelection}
            | To: {targetSelection.category}{targetSelection.subcategory
              ? ` → ${targetSelection.subcategory}`
              : ""}
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if currentTask}
  <p class="flex justify-around pb-1.5 {showReallocationMode ? 'mt-32' : ''}">
    {currentTask.subcategory}
    {fmtDuration(nowMinutes() - currentTask.timestampStart)}
    <button class="border">Split time</button>
    <button class="border" onclick={handleReallocationModeToggle}>Realloc</button>
  </p>
{/if}

<div class="flex flex-col gap-5 {showReallocationMode ? 'mt-8' : ''}">
  {#each Object.entries(showReallocationMode ? previewBudget : budget) as [categoryName, category]}
    {@const categoryAvailable = getAvailableTime(budget, accumulatedTime, categoryName, null)}
    {@const isSourceCategory =
      sourceSelection?.category === categoryName && !sourceSelection.subcategory}
    {@const isTargetCategory =
      targetSelection?.category === categoryName && !targetSelection.subcategory}
    {@const hasSelectedSubcategory =
      (sourceSelection?.category === categoryName && sourceSelection.subcategory) ||
      (targetSelection?.category === categoryName && targetSelection.subcategory)}

    <div
      class="block {isSourceCategory || isTargetCategory || hasSelectedSubcategory
        ? 'sticky rounded border bg-white p-2'
        : ''}"
      style={isSourceCategory
        ? "top: 180px; z-index: 40;"
        : isTargetCategory
          ? "top: 220px; z-index: 39;"
          : hasSelectedSubcategory
            ? "top: 260px; z-index: 38;"
            : ""}
    >
      <LabeledProgress
        spent={categoryOverages[categoryName] ?? 0}
        budget={category.time -
          Object.values(category.subcategories).reduce((sum, budget) => sum + budget, 0)}
        style={showReallocationMode && categoryAvailable > 0 ? "cursor-pointer" : ""}
        onclick={showReallocationMode && categoryAvailable > 0
          ? () => handleCategoryClick(categoryName)
          : undefined}
      >
        <h2
          class="text-xl font-bold {isSourceCategory
            ? 'text-blue-600'
            : isTargetCategory
              ? 'text-green-600'
              : ''}"
        >
          {categoryName}
        </h2>
      </LabeledProgress>

      {#each Object.entries(category.subcategories) as [subcategoryName, subcategoryBudget]}
        {@const subcategoryAvailable = getAvailableTime(
          budget,
          accumulatedTime,
          categoryName,
          subcategoryName,
        )}
        {@const isSourceSubcategory =
          sourceSelection?.category === categoryName &&
          sourceSelection?.subcategory === subcategoryName}
        {@const isTargetSubcategory =
          targetSelection?.category === categoryName &&
          targetSelection?.subcategory === subcategoryName}

        <div
          class={isSourceSubcategory || isTargetSubcategory
            ? "sticky ml-2 rounded border bg-white p-1"
            : ""}
          style={isSourceSubcategory
            ? "top: 300px; z-index: 37;"
            : isTargetSubcategory
              ? "top: 340px; z-index: 36;"
              : ""}
        >
          <LabeledProgress
            spent={accumulatedTime[categoryName + subcategoryName] ?? 0}
            budget={subcategoryBudget}
            style={showReallocationMode
              ? subcategoryAvailable > 0
                ? "cursor-pointer"
                : "cursor-not-allowed opacity-50"
              : "cursor-pointer"}
            onclick={showReallocationMode
              ? subcategoryAvailable > 0
                ? () => handleCategoryClick(categoryName, subcategoryName)
                : undefined
              : () => switchTask(categoryName, subcategoryName)}
          >
            {#if !showReallocationMode && currentTask?.category === categoryName && currentTask?.subcategory === subcategoryName}
              ▶️
            {/if}
            {#if isSourceSubcategory}
              🔵
            {:else if isTargetSubcategory}
              🟢
            {/if}
            {subcategoryName}
          </LabeledProgress>
        </div>
      {/each}
    </div>
  {/each}

  <LabeledProgress spent={calculateOverage(budget, accumulatedTime)} budget={unallocatedTime}>
    <h2 class="font-bold">Unallocated time</h2>
  </LabeledProgress>
</div>

<div class="text-center">
  <a href={resolve("/settings")}>
    <button class="border">Settings</button>
  </a>
  <button class="border" onclick={exportSpentTime}>Export</button>
</div>
