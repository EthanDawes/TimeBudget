<script lang="ts">
  import {
    fmtDuration,
    formatTimeFromMinutes,
    HOUR,
    MILLISECOND,
    MINUTE,
    nowMinutes,
    parseTimeToMinutes,
  } from "$lib/time"
  import { type BudgetConfig, loadWeeklyBudgetConfig, type SplitEntry } from "$lib/budgetManager"
  import type { TimeEntry } from "$lib/db"

  let {
    currentTasks = [],
    isOpen = $bindable(false),
    onsubmit,
  }: {
    currentTasks: TimeEntry[]
    isOpen: boolean
    onsubmit: (splitEntries: SplitEntry[]) => void
  } = $props()

  let budget: BudgetConfig = loadWeeklyBudgetConfig()
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
        isConcurrent: false,
      },
      {
        // Very similar to calling `addEntry` but for some reason doing that here error loops
        id: crypto.randomUUID(),
        startTime: nowMinutes(),
        startTimeText: "",
        category: firstTask.category,
        subcategory: firstTask.subcategory,
        isConcurrent: false,
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
      isConcurrent: false,
    }

    splitEntries.push(newEntry)
    sortEntriesByTime()
  }

  function removeEntry(index: number) {
    if (index === 0) return // Can't remove first entry
    splitEntries.splice(index, 1)
  }

  function sortEntriesByTime() {
    // Keep the first entry in place, sort the rest by start time
    const firstEntry = splitEntries[0]
    const restEntries = splitEntries.slice(1).sort((a, b) => {
      // Put entries without valid start times last
      if (!a.startTime && !b.startTime) return 0
      if (!a.startTime) return 1
      if (!b.startTime) return -1
      return a.startTime - b.startTime
    })
    splitEntries = [firstEntry, ...restEntries]
  }

  function updateStartTime(index: number, timeText: string) {
    if (index === 0) return // First entry time is locked

    const entry = splitEntries[index]
    entry.startTimeText = timeText

    if (timeText.trim()) {
      entry.startTime = parseTimeToMinutes(timeText)
    }

    // Sort entries by time and trigger reactivity
    sortEntriesByTime()
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

  function toggleConcurrent(index: number) {
    const entry = splitEntries[index]
    entry.isConcurrent = !entry.isConcurrent

    if (entry.isConcurrent && !entry.endTime && entry.startTime) {
      // Set default end time to 1 hour after start
      entry.endTime = entry.startTime + HOUR
      entry.endTimeText = formatTimeFromMinutes(entry.endTime)
    } else if (!entry.isConcurrent) {
      entry.endTime = undefined
      entry.endTimeText = undefined
    }

    // Update splitEntries to trigger reactivity
    splitEntries = [...splitEntries]
  }

  function getCategoryOptions() {
    const options = []

    for (const [categoryName, category] of Object.entries(budget)) {
      // Only add subcategory options (no category-only options)
      for (const subcategoryName of Object.keys(category.subcategories)) {
        options.push({
          value: `${categoryName}|${subcategoryName}`,
          label: `${categoryName} → ${subcategoryName}`,
        })
      }
    }

    return options
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

      if (entry.isConcurrent && !entry.endTimeText?.trim()) {
        alert(`Entry ${i + 1}: End time cannot be empty for concurrent tasks`)
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
          <div class="flex flex-1 items-center gap-2">
            <!-- Start time -->
            <div class="flex-shrink-0">
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
            </div>

            <!-- Category/Subcategory dropdown -->
            <select
              value={`${entry.category}|${entry.subcategory}`}
              onchange={(e) => updateCategory(index, (e.target as HTMLSelectElement).value)}
              class="min-w-0 flex-1 rounded border px-1 py-1 text-sm sm:px-2"
            >
              {#each getCategoryOptions() as option}
                <option value={option.value}>{option.label}</option>
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

          <!-- Duration and controls row -->
          <div class="flex items-center gap-2 text-sm">
            <!-- Duration display -->
            {#if entry.isConcurrent && entry.startTime && entry.endTime}
              <div class="text-gray-600">
                Duration: {fmtDuration(entry.endTime - entry.startTime)}
              </div>
            {:else if !entry.isConcurrent}
              {@const nextEntry = splitEntries[index + 1]}
              {@const endTime = nextEntry?.startTime || nowMinutes()}
              {#if entry.startTime}
                <div class="text-gray-600">
                  Duration: {fmtDuration(endTime - entry.startTime)}
                </div>
              {/if}
            {/if}

            <!-- Concurrent toggle -->
            <label class="ml-auto flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={entry.isConcurrent}
                onchange={() => toggleConcurrent(index)}
              />
              Concurrent
            </label>

            <!-- End time (only for concurrent tasks) -->
            {#if entry.isConcurrent}
              <div class="flex-shrink-0">
                <input
                  type="text"
                  value={entry.endTimeText || ""}
                  oninput={(e) => updateEndTime(index, (e.target as HTMLInputElement).value)}
                  class="w-16 rounded border px-1 py-1 text-center text-sm sm:w-20 sm:px-2"
                  placeholder="13:30"
                />
              </div>
            {/if}
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
