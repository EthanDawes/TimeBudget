<script lang="ts">
  import {
    activeTimers,
    finishTaskById,
    splitTime,
    type SplitEntry,
  } from "$lib/budgetManager"
  import { resolve } from "$app/paths"
  import { fmtDuration, nowMinutes } from "$lib/time"
  import { db, type TimeEntry } from "$lib/db"
  import { liveQuery } from "dexie"
  import { onDestroy } from "svelte"
  import { goto } from "$app/navigation"
  import SplitTimeModal from "./SplitTimeModal.svelte"

  interface TrackerHeaderProps {
    currentTasks?: TimeEntry[]
    now?: number
    onStopTask?: (taskId: number) => void
    onUndo?: () => void
    onSplitSubmit?: (entries: SplitEntry[]) => void
  }

  let {
    currentTasks: propTasks,
    now: propNow,
    onStopTask,
    onUndo,
    onSplitSubmit,
  }: TrackerHeaderProps = $props()

  let _localTasks = liveQuery(() => activeTimers())
  let currentTasks = $derived(propTasks ?? $_localTasks ?? [])

  let localNow = $state(nowMinutes())
  const ticker = setInterval(() => {
    localNow = nowMinutes()
  }, 30_000)
  onDestroy(() => clearInterval(ticker))

  let now = $derived(propNow ?? localNow)

  let showSplitTimeModal = $state(false)

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
        animate: false,
      }
    }
    if (!syncState) {
      return {
        color: "bg-gray-400",
        label: "Connecting",
        description: "Connecting to cloud...",
        animate: false,
      }
    }
    const { phase, error } = syncState
    switch (phase) {
      case "in-sync":
        return {
          color: "bg-emerald-500",
          label: "In Sync",
          description: "All changes synced to cloud",
          animate: false,
        }
      case "pushing":
      case "pulling":
        return {
          color: "bg-indigo-500",
          label: "Syncing",
          description: "Syncing changes with cloud...",
          animate: true,
        }
      case "initial":
        return {
          color: "bg-blue-500",
          label: "Initializing",
          description: "Initializing cloud sync...",
          animate: true,
        }
      case "not-in-sync":
        return {
          color: "bg-amber-500",
          label: "Pending Sync",
          description: "Changes pending sync (offline or paused)",
          animate: false,
        }
      case "offline":
        return {
          color: "bg-amber-500",
          label: "Offline",
          description: "Database is offline",
          animate: false,
        }
      case "error":
        return {
          color: "bg-rose-500",
          label: "Error",
          description: error?.message
            ? `Sync error: ${error.message}`
            : "Sync encountered an error",
          animate: false,
        }
      default:
        return {
          color: "bg-gray-400",
          label: syncState.status || "Disconnected",
          description: `Status: ${syncState.status || "unknown"}`,
          animate: false,
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

  async function handleStopTask(taskId: number) {
    if (onStopTask) {
      onStopTask(taskId)
    } else {
      await finishTaskById(taskId)
    }
  }

  async function handleUndo() {
    if (onUndo) {
      onUndo()
      return
    }
    if (!confirm("Are you sure?")) return
    const [last, secondLast] = await db.timeEntries
      .orderBy("timestampStart")
      .reverse()
      .limit(2)
      .primaryKeys()
    db.timeEntries.delete(last)
    db.timeEntries.update(secondLast, { duration: undefined })
  }

  function handleSplitTimeSubmit(splitEntries: SplitEntry[]) {
    if (onSplitSubmit) {
      onSplitSubmit(splitEntries)
    } else {
      splitTime(splitEntries)
    }
  }
</script>

{#if currentTasks.length > 0}
  <div class="pb-1.5">
    {#each currentTasks as task (task.id)}
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
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full {syncInfo.color} opacity-40"
              ></span>
            {/if}
            <span
              class="relative inline-flex h-2.5 w-2.5 rounded-full {syncInfo.color} shadow-[0_0_6px_rgba(0,0,0,0.1)] transition-colors duration-500"
            ></span>
          </button>

          <button
            class="border-none bg-transparent p-0 text-blue-600 {currentTasks.length > 1
              ? 'cursor-pointer'
              : 'cursor-not-allowed opacity-50'}"
            onclick={() => currentTasks.length > 1 && handleStopTask(task.id!)}
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
      <button class="border" onclick={handleUndo}>Undo</button>
    </div>
  </div>
{/if}

<SplitTimeModal {currentTasks} bind:isOpen={showSplitTimeModal} onsubmit={handleSplitTimeSubmit} />
