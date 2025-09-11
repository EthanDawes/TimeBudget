<script lang="ts">
  import { fmtDuration, nowMinutes, parseTimeString, HOUR, MINUTE, MILLISECOND } from "$lib/time"
  import { loadWeeklyBudgetConfig, type BudgetConfig } from "$lib/budgetManager"
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

  interface SplitEntry {
    id: string
    startTime?: number
    startTimeText: string
    category: string
    subcategory: string
    isConcurrent: boolean
    endTime?: number
    endTimeText?: string
  }

  let budget: BudgetConfig = loadWeeklyBudgetConfig()
  let splitEntries: SplitEntry[] = $state([])
  let modal: HTMLDialogElement

  // Generate time suggestions (every 15 minutes)
  function generateTimeSuggestions(
    baseTime: number,
    isStartTime: boolean = true,
  ): Array<{ time: number; text: string; duration: string }> {
    const suggestions = []
    const now = nowMinutes()
    const firstTaskStart = currentTasks[0]?.timestampStart || now

    // For start times: don't show times before the first task or after current time
    // For end times: show reasonable range around the base time
    const minTime = isStartTime ? firstTaskStart : baseTime - 2 * HOUR
    const maxTime = isStartTime ? now : baseTime + 4 * HOUR

    // Generate suggestions in 15-minute increments
    for (let time = minTime; time <= maxTime; time += 15 * MINUTE) {
      // Convert minutes-since-epoch to local time for display
      const date = new Date(time / MILLISECOND)
      const hours = date.getHours()
      const minutes = date.getMinutes()
      const timeText = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
      const duration = fmtDuration(Math.abs(time - baseTime))

      suggestions.push({
        time,
        text: timeText,
        duration: `(${duration})`,
      })
    }

    return suggestions
  }

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
        // startTime should both be blank
        startTimeText: "",
        category: firstTask.category,
        subcategory: firstTask.subcategory,
        isConcurrent: false,
      },
    ]
  }

  function formatTimeFromMinutes(minutes: number): string {
    // Convert minutes-since-epoch to a Date object to get local time
    const date = new Date(minutes / MILLISECOND) // Convert minutes to milliseconds
    const hours = date.getHours()
    const mins = date.getMinutes()
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
  }

  function parseTimeToMinutes(timeText: string, baseDate: number = nowMinutes()): number {
    try {
      const [hours, minutes] = timeText.split(":").map(Number)

      // Create a Date object from the baseDate to get the current day in local time
      const baseDateTime = new Date(baseDate / MILLISECOND)

      // Create a new Date for the same day but with the specified time
      const targetDate = new Date(
        baseDateTime.getFullYear(),
        baseDateTime.getMonth(),
        baseDateTime.getDate(),
        hours,
        minutes,
        0,
        0,
      )

      // Convert back to minutes-since-epoch
      return Math.floor(targetDate.getTime() * MILLISECOND)
    } catch {
      return baseDate
    }
  }

  function addEntry() {
    const lastEntry = splitEntries[splitEntries.length - 1]

    const newEntry = {
      id: crypto.randomUUID(),
      // startTime and startTimeText should both be blank
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
    const restEntries = splitEntries
      .slice(1)
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
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
  class="modal w-full max-w-4xl rounded-lg p-6"
  onclick={(e) => e.target === modal && closeModal()}
>
  <div class="modal-content">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl font-bold">Split Time</h2>
      <button class="text-2xl text-gray-500 hover:text-gray-700" onclick={closeModal}>×</button>
    </div>

    <div class="space-y-3">
      {#each splitEntries as entry, index}
        <div class="flex items-center gap-3 rounded-lg border bg-gray-50 p-3">
          <!-- Start time -->
          <div class="flex-shrink-0">
            <input
              type="text"
              value={entry.startTimeText}
              oninput={(e) => updateStartTime(index, (e.target as HTMLInputElement).value)}
              disabled={index === 0}
              class="w-20 rounded border px-2 py-1 text-center {index === 0 ? 'bg-gray-200' : ''}"
              placeholder="12:30"
              list={`start-times-${entry.id}`}
            />
            {#if index > 0}
              <datalist id={`start-times-${entry.id}`}>
                {#each generateTimeSuggestions(entry.startTime || nowMinutes(), true) as suggestion}
                  <option value={suggestion.text}>{suggestion.text} {suggestion.duration}</option>
                {/each}
              </datalist>
            {/if}
          </div>

          <!-- Duration display -->
          {#if index > 0 && entry.startTime && splitEntries[index - 1]?.startTime}
            <div class="min-w-fit text-sm text-gray-600">
              ({fmtDuration(entry.startTime - (splitEntries[index - 1]?.startTime || 0))})
            </div>
          {/if}

          <!-- Category/Subcategory dropdown -->
          <select
            value={`${entry.category}|${entry.subcategory}`}
            onchange={(e) => updateCategory(index, (e.target as HTMLSelectElement).value)}
            class="flex-1 rounded border px-2 py-1"
          >
            {#each getCategoryOptions() as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>

          <!-- Concurrent toggle -->
          <label class="flex items-center gap-2 text-sm">
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
                class="w-20 rounded border px-2 py-1 text-center"
                placeholder="13:30"
                list={`end-times-${entry.id}`}
              />
              <datalist id={`end-times-${entry.id}`}>
                {#each generateTimeSuggestions(entry.endTime || (entry.startTime || nowMinutes()) + HOUR, false) as suggestion}
                  <option value={suggestion.text}>{suggestion.text} {suggestion.duration}</option>
                {/each}
              </datalist>
            </div>
          {/if}

          <!-- Remove button -->
          <button
            class="rounded border border-red-300 px-2 py-1 text-sm text-red-500 hover:text-red-700 disabled:opacity-30"
            onclick={() => removeEntry(index)}
            disabled={index === 0}
          >
            ×
          </button>
        </div>
      {/each}
    </div>

    <!-- Add entry button -->
    <div class="mt-4">
      <button
        class="rounded bg-blue-100 px-4 py-2 text-blue-700 hover:bg-blue-200"
        onclick={addEntry}
      >
        + Add Time Period
      </button>
    </div>

    <!-- Submit buttons -->
    <div class="mt-6 flex justify-end gap-3">
      <button class="rounded border px-4 py-2 hover:bg-gray-50" onclick={closeModal}>
        Cancel
      </button>
      <button
        class="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
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
    max-height: 80vh;
    overflow-y: auto;
  }
</style>
