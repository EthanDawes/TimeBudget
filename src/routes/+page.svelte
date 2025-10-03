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
    cleanupLongRunningTasks,
    splitTime,
    type AccumulatedTime,
    type BudgetConfig,
    type SplitEntry,
  } from "$lib/budgetManager"
  import { exportSpentTime } from "$lib/db"
  import LabeledProgress from "./LabeledProgress.svelte"
  import SplitTimeModal from "./SplitTimeModal.svelte"
  import RebudgetModal from "./RebudgetModal.svelte"
  import { resolve } from "$app/paths"
  import { fmtDuration, MINUTE, nowMinutes, parseTimeString } from "$lib/time"
  import type { TimeEntry } from "$lib/db"
  import { ceilTo } from "$lib"

  let budget = $state<BudgetConfig>(loadWeeklyBudgetConfig())
  let accumulatedTime = $state({} as AccumulatedTime)
  let categoryOverages = $state({} as Record<string, number>)
  let unallocatedTime = $state(0)
  let currentTasks = $state<TimeEntry[]>([])
  let showReallocationMode = $state(false)
  let showSplitTimeModal = $state(false)

  let rebudgetModal = $state<RebudgetModal>()

  async function setState() {
    // Clean up any tasks that have been running for more than 24 hours
    await cleanupLongRunningTasks()

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

    // Reallocation mode behavior - delegate to modal
    rebudgetModal!.handleCategoryClick(category, subcategory)
  }

  function handleRebudgetCommit(newBudget: BudgetConfig) {
    budget = newBudget
    saveWeeklyBudgetConfig(newBudget)
    setState()
    handleReallocationModeToggle()
  }

  function handleRebudgetCancel() {
    handleReallocationModeToggle()
  }

  function handleRebudgetFinish() {
    const sourceSelection = rebudgetModal?.getSourceSelection()
    if (!sourceSelection?.subcategory) {
      alert("You cannot finish a category, only subcategories")
      return
    }

    // delete subcategory from this week's budget
    delete budget[sourceSelection.category].subcategories[sourceSelection.subcategory]

    saveWeeklyBudgetConfig(budget)
    setState()
    handleReallocationModeToggle()
  }

  function handleSplitTimeSubmit(splitEntries: SplitEntry[]) {
    splitTime(splitEntries).then(() => {
      setState()
    })
  }
</script>

<svelte:head>
  <title>Time Budget Tracker</title>
</svelte:head>

{#if currentTasks.length > 0 && !showReallocationMode}
  <div class="pb-1.5">
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
      </p>
    {/each}
    <div class="flex justify-around">
      <button class="border" onclick={() => (showSplitTimeModal = true)}>Split tracking</button>
      <button class="border" onclick={handleReallocationModeToggle}>Rebudget</button>
    </div>
  </div>
{/if}

<div class="flex flex-col gap-5 {showReallocationMode ? 'mt-32' : ''}">
  {#each Object.entries(showReallocationMode ? rebudgetModal?.getPreviewBudget() || budget : budget) as [categoryName, category] (categoryName)}
    {@const categoryAvailable = getAvailableTime(budget, accumulatedTime, categoryName, null)}
    {@const sourceSelection = rebudgetModal?.getSourceSelection()}
    {@const targetSelection = rebudgetModal?.getTargetSelection()}
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
        : ''}"
    >
      <LabeledProgress
        spent={categoryOverages[categoryName] ?? 0}
        budget={(category as any).time -
          (Object.values((category as any).subcategories) as number[]).reduce(
            (sum: number, budget: number) => sum + budget,
            0,
          )}
        style={showReallocationMode
          ? !sourceSelection && categoryAvailable <= 0
            ? "cursor-not-allowed opacity-50 grayscale"
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

      {#each Object.entries((category as any).subcategories) as [subcategoryName, subcategoryBudget]}
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
            budget={subcategoryBudget as number}
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
                ▶️
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

<SplitTimeModal {currentTasks} bind:isOpen={showSplitTimeModal} onsubmit={handleSplitTimeSubmit} />

<RebudgetModal
  bind:this={rebudgetModal}
  bind:isOpen={showReallocationMode}
  {budget}
  {accumulatedTime}
  onCommit={handleRebudgetCommit}
  onCancel={handleRebudgetCancel}
  onFinish={handleRebudgetFinish}
/>
