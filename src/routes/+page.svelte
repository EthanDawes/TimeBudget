<script lang="ts">
  import {
    accumulateTime,
    activeTimer,
    activeTimers,
    calculateCategoryOverage,
    calculateOverage,
    finishTask,
    finishTaskById,
    switchTaskConcurrent,
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
  let currentTasks = $state<TimeEntry[]>([])
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
    activeTimers().then((res) => (currentTasks = res))
  }
  setState()

  async function switchTask(category: string, subcategory: string) {
    await switchTaskConcurrent(category, subcategory)
    setState()
  }

  async function stopSpecificTask(taskId: number) {
    await finishTaskById(taskId)
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
      // Check if this task is currently running - if so, stop it (only if more than one task is running)
      const runningTask = currentTasks.find(
        (task) => task.category === category && task.subcategory === subcategory,
      )
      if (runningTask) {
        if (currentTasks.length > 1) {
          stopSpecificTask(runningTask.id)
        }
        return
      }

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

    const selection = { category, subcategory }

    if (!sourceSelection) {
      // For source selection, must have available time
      if (availableTime <= 0) return
      sourceSelection = selection
    } else if (
      !targetSelection &&
      (sourceSelection.category !== category || sourceSelection.subcategory !== subcategory)
    ) {
      // For target selection, can always select (even if no available time)
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

{#if currentTasks.length > 0}
  <div class="pb-1.5 {showReallocationMode ? 'mt-32' : ''}">
    {#each currentTasks as task}
      <p class="mb-1 flex justify-around border-b pb-1">
        <button
          class="border-none bg-transparent p-0 text-blue-600 {currentTasks.length > 1
            ? 'cursor-pointer'
            : 'cursor-not-allowed opacity-50'}"
          onclick={() => currentTasks.length > 1 && stopSpecificTask(task.id)}
          disabled={currentTasks.length <= 1}
          title={currentTasks.length <= 1
            ? "Cannot stop the last running task - at least one task must always be active"
            : "Click to stop this task"}
        >
          ▶️ {task.subcategory}
        </button>
        {fmtDuration(nowMinutes() - task.timestampStart)}
        <button class="border">Split time</button>
      </p>
    {/each}
    <div class="text-center">
      <button class="border" onclick={handleReallocationModeToggle}>Realloc</button>
    </div>
  </div>
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
    {@const isCategoryDisabled = showReallocationMode && !sourceSelection && categoryAvailable <= 0}

    <div
      class="block {isSourceCategory || isTargetCategory || hasSelectedSubcategory
        ? 'rounded border bg-white p-2'
        : ''} {isCategoryDisabled ? 'opacity-50 grayscale' : ''}"
    >
      <LabeledProgress
        spent={categoryOverages[categoryName] ?? 0}
        budget={category.time -
          Object.values(category.subcategories).reduce((sum, budget) => sum + budget, 0)}
        style={showReallocationMode
          ? !sourceSelection && categoryAvailable <= 0
            ? "cursor-not-allowed"
            : "cursor-pointer"
          : ""}
        onclick={showReallocationMode && !(!sourceSelection && categoryAvailable <= 0)
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

        {@const isDisabled = showReallocationMode && !sourceSelection && subcategoryAvailable <= 0}

        <div
          class="{isSourceSubcategory || isTargetSubcategory
            ? 'ml-2 rounded border bg-white p-1'
            : ''} {isDisabled ? 'opacity-50 grayscale' : ''}"
        >
          <LabeledProgress
            spent={accumulatedTime[categoryName + subcategoryName] ?? 0}
            budget={subcategoryBudget}
            style={showReallocationMode
              ? !sourceSelection && subcategoryAvailable <= 0
                ? "cursor-not-allowed"
                : "cursor-pointer"
              : "cursor-pointer"}
            onclick={() => handleCategoryClick(categoryName, subcategoryName)}
          >
            {#if !showReallocationMode}
              {@const isRunning = currentTasks.some(
                (task) => task.category === categoryName && task.subcategory === subcategoryName,
              )}
              {#if isRunning}
                {#if currentTasks.length > 1}
                  ▶️
                {:else}
                  🔒
                {/if}
              {/if}
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
