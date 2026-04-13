<script lang="ts">
  import {
    fmtDuration,
    formatTimeFromMinutes,
    HOUR,
    MILLISECOND,
    nowMinutes,
    parseTimeToMinutes,
  } from "$lib/time"
  import { onMount } from "svelte"
  import { loadWeeklyBudgetConfig, type SplitEntry } from "$lib/budgetManager"
  import type { TimeEntry, Budget } from "$lib/db"

  let {
    currentTasks = [],
    isOpen = $bindable(false),
    onsubmit,
  }: {
    currentTasks: TimeEntry[]
    isOpen: boolean
    onsubmit: (splitEntries: SplitEntry[]) => void
  } = $props()

  let budget = $state<Budget[]>([])

  onMount(async () => {
    budget = await loadWeeklyBudgetConfig()
  })
  let splitEntries: SplitEntry[] = $state([])
  let modal: HTMLDialogElement

  function initializeSplitEntries() {
    if (currentTasks.length === 0) return

    // Start with the first running task
    const firstTask = currentTasks[0]
    splitEntries = [
      {
        id: crypto.randomUUID(),
        startTime: firstTask.timestampStart,
        startTimeText: formatTimeFromMinutes(firstTask.timestampStart),
        category: firstTask.category,
        subcategory: firstTask.subcategory,
      },
      {
        // Very similar to calling `addEntry` but for some reason doing that here error loops
        id: crypto.randomUUID(),
        startTime: nowMinutes(),
        startTimeText: "",
        category: firstTask.category,
        subcategory: firstTask.subcategory,
      },
    ]
  }

  function addEntry() {
    const lastEntry = splitEntries[splitEntries.length - 1]

    const newEntry = {
      id: crypto.randomUUID(),
      startTime: nowMinutes(),
      startTimeText: "",
      category: lastEntry.category,
      subcategory: lastEntry.subcategory,
    }

    splitEntries.push(newEntry)
  }

  function removeEntry(index: number) {
    if (index === 0) return // Can't remove first entry
    splitEntries.splice(index, 1)
  }

  function updateStartTime(index: number, timeText: string) {
    if (index === 0) return // First entry time is locked

    const entry = splitEntries[index]
    entry.startTimeText = timeText

    if (timeText.trim()) {
      entry.startTime = parseTimeToMinutes(timeText)
    }
  }

  function updateEndTime(index: number, timeText: string) {
    const entry = splitEntries[index]
    entry.endTimeText = timeText

    if (timeText.trim()) {
      entry.endTime = parseTimeToMinutes(timeText)
    }

    // Update splitEntries to trigger reactivity
    splitEntries = [...splitEntries]
  }

  function updateCategory(index: number, value: string) {
    const [category, subcategory] = value.split("|")
    splitEntries[index].category = category
    splitEntries[index].subcategory = subcategory || ""

    // Update splitEntries to trigger reactivity
    splitEntries = [...splitEntries]
  }

  function handleSubmit() {
    // Validate that all entries have valid times
    for (let i = 0; i < splitEntries.length; i++) {
      const entry = splitEntries[i]

      if (!entry.startTimeText?.trim()) {
        alert(`Entry ${i + 1}: Start time cannot be empty`)
        return
      }

      if (isNaN(entry.startTime)) {
        alert(`Entry ${i + 1}: "${entry.startTimeText}" is not a valid time or duration`)
        return
      }

      if (Date.now() < entry.startTime / MILLISECOND) {
        alert(`Entry ${i + 1}: Start time cannot be in the future`)
        return
      }

      if (
        i < splitEntries.length - 1 &&
        splitEntries[i + 1].startTime < splitEntries[i].startTime
      ) {
        alert(`Entry ${i + 1}: End time cannot be before start time`)
        return
      }
    }

    // Call the submit handler prop
    onsubmit(splitEntries)
    closeModal()
  }

  function closeModal() {
    isOpen = false
    modal?.close()
  }

  // Initialize when modal opens
  $effect(() => {
    if (isOpen) {
      initializeSplitEntries()
      modal?.showModal()
    }
  })
</script>

<dialog
  bind:this={modal}
  class="modal mx-auto mt-4 max-w-4xl rounded-lg p-3 sm:p-6"
  onclick={(e) => e.target === modal && closeModal()}
>
  <div class="modal-content">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-xl font-bold sm:text-2xl">Split Time</h2>
      <button class="text-xl text-gray-500 hover:text-gray-700 sm:text-2xl" onclick={closeModal}
        >×</button
      >
    </div>

    <div class="space-y-2">
      {#each splitEntries as entry, index (entry.id)}
        <div
          class="flex flex-col gap-2 rounded-lg border bg-gray-50 p-2 sm:flex-row sm:items-center sm:gap-3 sm:p-3"
        >
          <!-- Main row with start time, category, and controls -->
          <div class="flex flex-1 items-center items-start gap-2">
            <!-- Start time + duration stacked -->
            <div class="flex flex-shrink-0 flex-col items-center gap-0.5">
              <input
                type="text"
                value={entry.startTimeText}
                oninput={(e) => updateStartTime(index, (e.target as HTMLInputElement).value)}
                disabled={index === 0}
                class="w-16 rounded border px-1 py-1 text-center text-sm sm:w-20 sm:px-2 {index ===
                0
                  ? 'bg-gray-200'
                  : ''}"
                placeholder="12:30"
              />
              {#if entry.startTime}
                {@const nextEntry = splitEntries[index + 1]}
                {@const endTime = nextEntry?.startTime || nowMinutes()}
                <div class="text-center text-xs text-gray-500">
                  {fmtDuration(endTime - entry.startTime)}
                </div>
              {/if}
            </div>

            <!-- Category/Subcategory dropdown -->
            <select
              value={`${entry.category}|${entry.subcategory}`}
              onchange={(e) => updateCategory(index, (e.target as HTMLSelectElement).value)}
              class="min-w-0 flex-1 rounded border px-1 py-1 text-sm sm:px-2"
            >
              {#each budget as cat}
                <optgroup label={cat.name}>
                  {#each cat.subcategories as sub}
                    <option value="{cat.name}|{sub.name}">{sub.name}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>

            <!-- Remove button -->
            <button
              class="rounded border border-red-300 px-2 py-1 text-sm text-red-500 hover:text-red-700 disabled:opacity-30"
              onclick={() => removeEntry(index)}
              disabled={index === 0}
            >
              ×
            </button>
          </div>
        </div>
      {/each}
    </div>

    <!-- Add entry button -->
    <div class="mt-3">
      <button
        class="rounded bg-blue-100 px-3 py-2 text-sm text-blue-700 hover:bg-blue-200"
        onclick={addEntry}
      >
        + Add Time Period
      </button>
    </div>

    <!-- Submit buttons -->
    <div class="mt-4 flex flex-col justify-end gap-2 sm:flex-row sm:gap-3">
      <button class="rounded border px-4 py-2 text-sm hover:bg-gray-50" onclick={closeModal}>
        Cancel
      </button>
      <button
        class="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
        onclick={handleSubmit}
      >
        Split Time
      </button>
    </div>
  </div>
</dialog>

<style>
  .modal {
    border: none;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  }

  .modal::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
  }

  .modal-content {
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal {
    width: calc(100% - 2rem);
  }
</style>
