<script lang="ts">
  import {
    activeTimers,
    finishTaskById,
    switchTaskConcurrent,
    loadBudgetConfig,
    cleanupLongRunningTasks,
    fixDuplicateActiveTasks,
    calculateGapTime,
  } from "$lib/budgetManager"
  import { computeCategoryProgress } from "$lib/budgetCalculations"
  import BudgetProgressView from "./BudgetProgressView.svelte"
  import TrackerHeader from "./TrackerHeader.svelte"
  import { MILLISECOND, DAY, nowMinutes, shiftWeekday } from "$lib/time"
  import { liveQuery } from "dexie"
  import { db } from "$lib/db"
  import { onDestroy } from "svelte"

  // If I forget to take a screenshot by the end of the day, rather than adding a UI feature, just change date in settings.
  const todayDay = shiftWeekday(new Date().getDay())
  const todayStart = new Date().setHours(0, 0, 0, 0) * MILLISECOND - 1 // subtract 1 to include events that start exactly at midnight

  let _currentTasks = liveQuery(() => activeTimers())
  let currentTasks = $derived($_currentTasks || [])
  let _todayEvents = liveQuery(() => db.schedule.where("day").equals(todayDay).toArray())
  let todayEvents = $derived($_todayEvents || [])
  let _budgetTemplate = liveQuery(() => loadBudgetConfig())
  let budgetTemplate = $derived($_budgetTemplate || [])
  let zoomOut = $state(false)

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
      .between(todayStart, todayStart + DAY) // Upper bound is useful if looking back in time
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

  let timeGap = liveQuery(() =>
    db.timeEntries
      .where("timestampStart")
      .between(todayStart, todayStart + DAY) // Upper bound is useful if looking back in time
      .toArray()
      .then((entries) => calculateGapTime(entries, todayStart)),
  )

  let now = $state(nowMinutes())
  const ticker = setInterval(() => {
    now = nowMinutes()
  }, 30_000)
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
  let unallocatedSpent = $derived(
    Object.entries(effectiveSpent).reduce(
      (acc, [subcat, val]) => acc + Math.max(0, val - (budget[subcat] ?? 0)),
      0,
    ),
  )

  let progressData = $derived(
    computeCategoryProgress({
      categories: budgetTemplate,
      spentBySubcategory: effectiveSpent,
      customSubcategoryBudgets: budget,
      unallocatedBudget,
      unallocatedSpent: unallocatedSpent + ($timeGap ?? 0),
      keyFormat: "subcatOnly",
    }),
  )

  // Clean up any tasks that have been running for more than 24 hours
  cleanupLongRunningTasks() // ok to ignore async return
  // Resolve sync conflicts where 2+ tasks ended up running at the same time
  fixDuplicateActiveTasks() // ok to ignore async return

  function handleCategoryClick(category: string, subcategory?: string) {
    // Check if this task is currently running - if so, stop it (only if more than one task is running)
    const runningTask = currentTasks.find(
      (task) => task.category === category && task.subcategory === subcategory,
    )
    if (runningTask) {
      if (currentTasks.length > 1) {
        finishTaskById(runningTask.id!)
      }
      return
    }

    // Normal timer switching behavior
    if (subcategory) {
      switchTaskConcurrent(category, subcategory)
    }
  }
</script>

{#snippet topSection()}
  <TrackerHeader {currentTasks} {now} />
{/snippet}

{#snippet subcategoryPrefix(sub: { name: string }, cat: { name: string })}
  {@const isRunning = currentTasks.some(
    (task) => task.category === cat.name && task.subcategory === sub.name,
  )}
  {#if isRunning}
    ▶️
  {/if}
{/snippet}

{#snippet footerExtras()}
  <label>
    Zoom&nbsp;out
    <input type="checkbox" bind:checked={zoomOut} />
  </label>
{/snippet}

<BudgetProgressView
  categories={progressData.categories}
  unallocated={progressData.unallocated}
  hideEmpty={true}
  {zoomOut}
  isMultiBar={false}
  top={topSection}
  {subcategoryPrefix}
  {footerExtras}
  onSubcategoryClick={(sub, cat) => handleCategoryClick(cat.name, sub.name)}
/>
