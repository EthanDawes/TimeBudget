<script lang="ts">
  import { ceilTo } from "$lib"
  import { fmtDuration, MINUTE, parseTimeString } from "$lib/time"
  import type { AccumulatedTime, BudgetConfig } from "$lib/budgetManager"
  import { getAvailableTime, reallocateTime } from "$lib/budgetManager"

  interface Props {
    isOpen: boolean
    budget: BudgetConfig
    accumulatedTime: AccumulatedTime
    onCommit: (newBudget: BudgetConfig) => void
    onCancel: () => void
    onFinish: () => void
  }

  let {
    isOpen = $bindable(),
    budget,
    accumulatedTime,
    onCommit,
    onCancel,
    onFinish,
  }: Props = $props()

  let sourceSelection = $state<{ category: string; subcategory?: string } | null>(null)
  let targetSelection = $state<{ category: string; subcategory?: string } | null>(null)
  let reallocationAmount = $state(0)
  let reallocationAmountText = $state("")

  $effect(() => {
    if (reallocationAmount > maxReallocationAmount) reallocationAmount = maxReallocationAmount
  })

  export function handleCategoryClick(category: string, subcategory?: string) {
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

  function handleCancel() {
    // Reset selections when canceling
    sourceSelection = null
    targetSelection = null
    reallocationAmount = 0
    reallocationAmountText = ""
    onCancel()
  }

  function handleFinish() {
    if (commitReallocation()) {
      if (!sourceSelection!.subcategory) {
        alert("You cannot finish a category, only subcategories")
        return
      }
      onFinish()
    }
  }

  // Returns success state
  function commitReallocation() {
    if (!sourceSelection || !targetSelection || reallocationAmount <= 0) return false

    try {
      const newBudget = reallocateTime(
        budget,
        sourceSelection.category,
        sourceSelection.subcategory || null,
        targetSelection.category,
        targetSelection.subcategory || null,
        reallocationAmount,
      )

      onCommit(newBudget)
      handleCancel() // Reset state after successful commit
      return true
    } catch (error) {
      console.error("Error rebudgeting time:", error)
      return false
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

  // Export getters for accessing state from parent
  export function getPreviewBudget() {
    return previewBudget
  }

  export function getSourceSelection() {
    return sourceSelection
  }

  export function getTargetSelection() {
    return targetSelection
  }
</script>

{#if isOpen}
  <div class="fixed top-0 right-0 left-0 z-50 border-b bg-white p-4 shadow-lg">
    <div class="mx-auto max-w-4xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">Rebudget Time</h3>
        <div class="flex space-x-2">
          <button
            class="rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50"
            onclick={commitReallocation}
            disabled={!sourceSelection || !targetSelection || reallocationAmount <= 0}
          >
            Commit
          </button>
          <button class="rounded border px-3 py-1" onclick={handleCancel}> Cancel </button>
        </div>
      </div>

      <div class="flex items-center space-x-4">
        <div class="flex-1">
          <input
            type="range"
            min="0"
            max={ceilTo(maxReallocationAmount, 30)}
            step={30 * MINUTE}
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
        {#if reallocationAmount == maxReallocationAmount}
          <button class="rounded bg-green-600 px-3 py-1 text-white" onclick={handleFinish}>
            Finish
          </button>
        {/if}
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
