<script lang="ts">
  import {
    activeTimers,
    finishTaskById,
    switchTaskConcurrent,
    loadBudgetConfig,
    cleanupLongRunningTasks,
    splitTime,
    type SplitEntry,
  } from "$lib/budgetManager"
  import { exportSpentTime } from "$lib/db"
  import LabeledProgress from "./LabeledProgress.svelte"
  import SplitTimeModal from "./SplitTimeModal.svelte"
  import { resolve } from "$app/paths"
  import { fmtDuration, MILLISECOND, DAY, nowMinutes, shiftWeekday } from "$lib/time"
  import { liveQuery } from "dexie"
  import { db } from "$lib/db"
  import { onDestroy } from "svelte"

  const todayDay = shiftWeekday(new Date().getDay())
  const todayStart = new Date().setHours(0, 0, 0, 0) * MILLISECOND

  let _currentTasks = liveQuery(() => activeTimers())
  let currentTasks = $derived($_currentTasks || [])
  let showSplitTimeModal = $state(false)
  let _todayEvents = liveQuery(() => db.schedule.where("day").equals(todayDay).toArray())
  let todayEvents = $derived($_todayEvents || [])
  let _budgetTemplate = liveQuery(() => loadBudgetConfig())
  let budgetTemplate = $derived($_budgetTemplate || [])

  // Maps subcat to time budgeted
  let budget = $derived(
    todayEvents.reduce(
      (budget, { subcat, duration }) => {
        budget[subcat] = (budget[subcat] ?? 0) + duration
        return budget
      },
      {} as Record<string, number>,
    ),
  )

  let _spent = liveQuery(() =>
    db.timeEntries
      .where("timestampStart")
      .above(todayStart)
      .toArray()
      .then((entries) =>
        entries.reduce(
          (spent, { subcategory, duration }) => {
            spent[subcategory] = (spent[subcategory] ?? 0) + (duration ?? 0)
            return spent
          },
          {} as Record<string, number>,
        ),
      ),
  )
  let spent = $derived($_spent || {})

  let now = $state(nowMinutes())
  const ticker = setInterval(() => { now = nowMinutes() }, 30_000)
  onDestroy(() => clearInterval(ticker))

  let effectiveSpent = $derived.by(() => {
    const result = { ...spent }
    for (const task of currentTasks) {
      const elapsed = Math.max(0, now - task.timestampStart)
      result[task.subcategory] = (result[task.subcategory] ?? 0) + elapsed
    }
    return result
  })

  let unallocatedBudget = $derived(DAY - Object.values(budget).reduce((a, b) => a + b, 0))
  let unallocatedSpent = $derived(Object.values(effectiveSpent).reduce((a, b) => a + b, 0))

  // Clean up any tasks that have been running for more than 24 hours
  cleanupLongRunningTasks() // ok to ignore async return

  const setState = () => {} // TODO: delete

  async function switchTask(category: string, subcategory: string) {
    await switchTaskConcurrent(category, subcategory)
    setState()
  }

  async function stopSpecificTask(taskId: number) {
    await finishTaskById(taskId)
    setState()
  }

  function handleCategoryClick(category: string, subcategory?: string) {
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
  }

  function handleSplitTimeSubmit(splitEntries: SplitEntry[]) {
    splitTime(splitEntries).then(() => {
      setState()
    })
  }
</script>

{#if currentTasks.length > 0}
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
        {fmtDuration(now - task.timestampStart)}
      </p>
    {/each}
    <div class="flex justify-around">
      <button class="border" onclick={() => (showSplitTimeModal = true)}>Change tracking</button>
    </div>
  </div>
{/if}

<div class="flex flex-col gap-5">
  {#each budgetTemplate as cat}
    <div class="block">
      <div class="px-3 py-1">
        <h2 class="text-xl font-bold">
          {cat.name}
        </h2>
      </div>

      {#each cat.subcategories as sub}
        <div>
          <LabeledProgress
            spent={effectiveSpent[sub.name] ?? 0}
            budget={budget[sub.name] ?? 0}
            style="cursor-pointer"
            onclick={() => handleCategoryClick(cat.name, sub.name)}
          >
            {@const isRunning = currentTasks.some(
              (task) => task.category === cat.name && task.subcategory === sub.name,
            )}
            {#if isRunning}
              ▶️
            {/if}
            {sub.name}
          </LabeledProgress>
        </div>
      {/each}
    </div>
  {/each}

  <div>
    <LabeledProgress spent={unallocatedSpent} budget={unallocatedBudget}>
      <h2 class="font-bold">Unallocated time</h2>
    </LabeledProgress>
  </div>
</div>

<div class="text-center">
  <a href={resolve("/day")}>
    <button class="border">Day history</button>
  </a>
  <a href={resolve("/week")}>
    <button class="border">Week history</button>
  </a>
  <a href={resolve("/settings")}>
    <button class="border">Settings</button>
  </a>
  <button class="border" onclick={exportSpentTime}>Export</button>
</div>

<SplitTimeModal {currentTasks} bind:isOpen={showSplitTimeModal} onsubmit={handleSplitTimeSubmit} />
