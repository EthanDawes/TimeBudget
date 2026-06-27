<script lang="ts">
  import {
    activeTimers,
    finishTaskById,
    switchTaskConcurrent,
    loadBudgetConfig,
    cleanupLongRunningTasks,
    fixDuplicateActiveTasks,
    splitTime,
    type SplitEntry,
    calculateGapTime,
  } from "$lib/budgetManager"
  import { exportSpentTime } from "$lib/db"
  import LabeledProgress from "./LabeledProgress.svelte"
  import SplitTimeModal from "./SplitTimeModal.svelte"
  import { resolve } from "$app/paths"
  import { fmtDuration, MILLISECOND, DAY, nowMinutes, shiftWeekday } from "$lib/time"
  import { liveQuery } from "dexie"
  import { db } from "$lib/db"
  import { onDestroy } from "svelte"
  import { goto } from "$app/navigation"

  // If I forget to take a screenshot by the end of the day, rather than adding a UI feature, just change date in settings.
  const todayDay = shiftWeekday(new Date().getDay())
  const todayStart = new Date().setHours(0, 0, 0, 0) * MILLISECOND - 1 // subtract 1 to include events that start exactly at midnight

  let _currentTasks = liveQuery(() => activeTimers())
  let currentTasks = $derived($_currentTasks || [])
  let showSplitTimeModal = $state(false)
  let _todayEvents = liveQuery(() => db.schedule.where("day").equals(todayDay).toArray())
  let todayEvents = $derived($_todayEvents || [])
  let _budgetTemplate = liveQuery(() => loadBudgetConfig())
  let budgetTemplate = $derived($_budgetTemplate || [])
  let zoomOut = $state(false)

  let _curUser = db.cloud.currentUser
  let curUser = $derived($_curUser)
  let dbLoggedIn = $derived(curUser?.userId && curUser.userId !== "unauthorized")

  let _syncState = db.cloud.syncState
  let syncState = $derived($_syncState)

  let syncInfo = $derived.by(() => {
    if (!dbLoggedIn) {
      return {
        color: "bg-gray-400 dark:bg-gray-500",
        label: "Not Configured",
        description: "Not logged in. Log in from settings to enable cloud sync.",
        animate: false
      }
    }
    if (!syncState) {
      return {
        color: "bg-gray-400",
        label: "Connecting",
        description: "Connecting to cloud...",
        animate: false
      }
    }
    const { phase, error } = syncState
    switch (phase) {
      case "in-sync":
        return {
          color: "bg-emerald-500",
          label: "In Sync",
          description: "All changes synced to cloud",
          animate: false
        }
      case "pushing":
      case "pulling":
        return {
          color: "bg-indigo-500",
          label: "Syncing",
          description: "Syncing changes with cloud...",
          animate: true
        }
      case "initial":
        return {
          color: "bg-blue-500",
          label: "Initializing",
          description: "Initializing cloud sync...",
          animate: true
        }
      case "not-in-sync":
        return {
          color: "bg-amber-500",
          label: "Pending Sync",
          description: "Changes pending sync (offline or paused)",
          animate: false
        }
      case "offline":
        return {
          color: "bg-amber-500",
          label: "Offline",
          description: "Database is offline",
          animate: false
        }
      case "error":
        return {
          color: "bg-rose-500",
          label: "Error",
          description: error?.message ? `Sync error: ${error.message}` : "Sync encountered an error",
          animate: false
        }
      default:
        return {
          color: "bg-gray-400",
          label: syncState.status || "Disconnected",
          description: `Status: ${syncState.status || "unknown"}`,
          animate: false
        }
    }
  })

  function handleSyncClick() {
    if (dbLoggedIn) {
      db.cloud.sync().catch(console.error)
    } else {
      goto(resolve("/settings"))
    }
  }

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

  // Clean up any tasks that have been running for more than 24 hours
  cleanupLongRunningTasks() // ok to ignore async return
  // Resolve sync conflicts where 2+ tasks ended up running at the same time
  fixDuplicateActiveTasks() // ok to ignore async return

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

  async function undoTrack() {
    if (!confirm("Are you sure?")) return
    const [last, secondLast] = await db.timeEntries
      .orderBy("timestampStart")
      .reverse()
      .limit(2)
      .primaryKeys()
    db.timeEntries.delete(last)
    db.timeEntries.update(secondLast, { duration: undefined })
  }
</script>

{#if currentTasks.length > 0}
  <div class="pb-1.5">
    {#each currentTasks as task}
      <p class="mb-1 flex items-center justify-around border-b pb-1">
        <span class="flex items-center gap-2">
          <!-- Sync status indicator -->
          <button
            class="relative flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full transition-all duration-300 hover:scale-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            onclick={handleSyncClick}
            title={dbLoggedIn 
              ? `Cloud Sync: ${syncInfo.label} (${syncInfo.description}). Click to force sync.` 
              : `Cloud Sync: ${syncInfo.description} Click to go to Settings.`}
            aria-label="Cloud sync status: {syncInfo.label}"
          >
            {#if syncInfo.animate}
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full {syncInfo.color} opacity-40"></span>
            {/if}
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full {syncInfo.color} transition-colors duration-500 shadow-[0_0_6px_rgba(0,0,0,0.1)]"></span>
          </button>

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
        </span>
        <span>
          {fmtDuration(now - task.timestampStart)}
        </span>
      </p>
    {/each}
    <div class="flex justify-around">
      <button class="border" onclick={() => (showSplitTimeModal = true)}>Change tracking</button>
      <button class="border" onclick={undoTrack}>Undo</button>
    </div>
  </div>
{/if}

<div class="flex flex-col gap-5" class:scale-50={zoomOut}>
  {#if zoomOut}
    <h2 class="h-0 text-center text-xl font-bold">
      {new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "numeric",
        day: "numeric",
      }).format(new Date())}
    </h2>
  {/if}
  {#each budgetTemplate as cat}
    <div class="block">
      <div class="px-3 py-1">
        <h2 class="text-xl font-bold">
          {cat.name}
        </h2>
      </div>

      {#each cat.subcategories as sub}
        {#if budget[sub.name] > 0 || effectiveSpent[sub.name] > 0}
          <div>
            <!-- Don't ?? 0 to budget in style b/c if there is no budget, its bar shouldn't be shown. -->
            <LabeledProgress
              spent={effectiveSpent[sub.name] ?? 0}
              budget={budget[sub.name] ?? 0}
              style={budget[sub.name] - (effectiveSpent[sub.name] ?? 0) > 0
                ? "cursor-pointer"
                : "opacity-50 pointer-events-none"}
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
        {/if}
      {/each}
    </div>
  {/each}

  <div>
    <LabeledProgress spent={unallocatedSpent + $timeGap} budget={unallocatedBudget}>
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
  <label>
    Zoom&nbsp;out
    <input type="checkbox" bind:checked={zoomOut} />
  </label>
</div>

<SplitTimeModal {currentTasks} bind:isOpen={showSplitTimeModal} onsubmit={handleSplitTimeSubmit} />
