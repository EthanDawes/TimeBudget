<script lang="ts">
  import { fmtDuration, parseTimeString } from "$lib/time"
  import type { BudgetConfig, AccumulatedTime } from "$lib/budgetManager"
  import { getAvailableTime, reallocateTime, validateReallocation } from "$lib/budgetManager"
  import CategoryList from "./CategoryList.svelte"

  interface ReallocationModalProps {
    open: boolean
    budget: BudgetConfig
    accumulatedTime: AccumulatedTime
    onClose: () => void
    onRealloc: (newBudget: BudgetConfig) => void
  }

  let { open, budget, accumulatedTime, onClose, onRealloc }: ReallocationModalProps = $props()

  let sourceCategory = $state("")
  let sourceSubcategory = $state("")
  let targetCategory = $state("")
  let targetSubcategory = $state("")
  let timeAmount = $state(0) // In minutes
  let timeInput = $state("") // String representation

  let dialog: HTMLDialogElement

  // Watch for open prop changes to show/hide dialog
  $effect(() => {
    if (dialog) {
      if (open) {
        dialog.showModal()
      } else {
        dialog.close()
      }
    }
  })

  // Reset form when modal opens
  $effect(() => {
    if (open) {
      sourceCategory = ""
      sourceSubcategory = ""
      targetCategory = ""
      targetSubcategory = ""
      timeAmount = 0
      timeInput = ""
    }
  })

  // Get maximum available time for slider
  let maxAvailableTime = $derived.by(() => {
    if (!sourceCategory) return 0
    return getAvailableTime(budget, accumulatedTime, sourceCategory, sourceSubcategory || null)
  })

  // Update slider when input changes
  $effect(() => {
    if (timeInput) {
      try {
        const parsed = parseTimeString(timeInput)
        if (parsed !== timeAmount && parsed <= maxAvailableTime) {
          timeAmount = parsed
        }
      } catch {
        // Invalid format, ignore
      }
    }
  })

  // Update input when slider changes
  $effect(() => {
    if (timeAmount > 0) {
      timeInput = fmtDuration(timeAmount)
    }
  })

  function handleSourceSelection(category: string, subcategory: string) {
    sourceCategory = category
    sourceSubcategory = subcategory
    // Reset time amount when source changes
    timeAmount = 0
    timeInput = ""
  }

  function handleTargetSelection(category: string, subcategory: string) {
    targetCategory = category
    targetSubcategory = subcategory
  }

  function handleSliderChange(event: Event) {
    const target = event.target as HTMLInputElement
    timeAmount = parseInt(target.value)
  }

  function handleInputChange(event: Event) {
    const target = event.target as HTMLInputElement
    timeInput = target.value
  }

  function handleReallocation() {
    if (!sourceCategory || !targetCategory || timeAmount <= 0) return

    const validation = validateReallocation(
      budget,
      accumulatedTime,
      sourceCategory,
      sourceSubcategory || null,
      targetCategory,
      targetSubcategory || null,
      timeAmount,
    )

    if (!validation.valid) {
      alert(validation.error)
      return
    }

    const newBudget = reallocateTime(
      budget,
      sourceCategory,
      sourceSubcategory || null,
      targetCategory,
      targetSubcategory || null,
      timeAmount,
    )

    onRealloc(newBudget)
    onClose()
  }

  // Check if reallocation is valid
  let isValidReallocation = $derived.by(() => {
    if (!sourceCategory || !targetCategory || timeAmount <= 0) return false

    const validation = validateReallocation(
      budget,
      accumulatedTime,
      sourceCategory,
      sourceSubcategory || null,
      targetCategory,
      targetSubcategory || null,
      timeAmount,
    )

    return validation.valid
  })
</script>

<dialog
  bind:this={dialog}
  class="modal h-full max-h-[90vh] w-full max-w-6xl rounded-lg p-0 shadow-xl"
>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex-shrink-0 border-b p-6">
      <h2 class="text-2xl font-bold">Reallocate Time</h2>
    </div>

    <!-- Time input controls -->
    <div class="flex-shrink-0 border-b bg-gray-50 p-6">
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <input
            type="range"
            min="0"
            max={maxAvailableTime}
            bind:value={timeAmount}
            onchange={handleSliderChange}
            class="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
            disabled={!sourceCategory}
          />
        </div>
        <div class="flex-shrink-0">
          <input
            type="text"
            placeholder="2h 10m"
            class="w-24 rounded border px-3 py-2 text-center"
            bind:value={timeInput}
            onchange={handleInputChange}
          />
        </div>
      </div>
      {#if sourceCategory}
        <div class="mt-2 text-sm text-gray-600">
          Available: {fmtDuration(maxAvailableTime)}
        </div>
      {/if}
    </div>

    <!-- Two column layout -->
    <div class="flex min-h-0 flex-1">
      <!-- From column -->
      <div class="flex w-1/2 flex-col border-r">
        <div class="flex-shrink-0 border-b bg-gray-100 p-4">
          <h3 class="font-semibold">From</h3>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <CategoryList
            {budget}
            {accumulatedTime}
            onItemClick={handleSourceSelection}
            filterZeroTime={true}
            selectedCategory={sourceCategory}
            selectedSubcategory={sourceSubcategory}
          />
        </div>
      </div>

      <!-- To column -->
      <div class="flex w-1/2 flex-col">
        <div class="flex-shrink-0 border-b bg-gray-100 p-4">
          <h3 class="font-semibold">To</h3>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <CategoryList
            {budget}
            {accumulatedTime}
            onItemClick={handleTargetSelection}
            filterZeroTime={false}
            selectedCategory={targetCategory}
            selectedSubcategory={targetSubcategory}
          />
        </div>
      </div>
    </div>

    <!-- Footer with action buttons -->
    <div class="flex-shrink-0 border-t bg-gray-50 p-6">
      <div class="flex justify-end space-x-3">
        <button class="rounded border px-4 py-2 hover:bg-gray-100" onclick={onClose}>
          Cancel
        </button>
        <button
          class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          onclick={handleReallocation}
          disabled={!isValidReallocation}
        >
          Reallocate Time
        </button>
      </div>
    </div>
  </div>
</dialog>

<style>
  .modal {
    border: none;
    background: white;
  }

  .modal::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
  }

  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
  }

  .slider::-moz-range-thumb {
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: none;
  }
</style>
