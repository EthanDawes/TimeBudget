<script lang="ts">
  import { fmtDuration, parseTimeString } from "$lib/time"
  import type { BudgetConfig, AccumulatedTime } from "$lib/budgetManager"
  import { getAvailableTime, reallocateTime, validateReallocation } from "$lib/budgetManager"
  import LabeledProgress from "./LabeledProgress.svelte"

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
  let timeAmount = $state("")

  let dialog: HTMLDialogElement

  // Get all categories and subcategories as dropdown options
  const getDropdownOptions = (excludeNoTime = false) => {
    const options: Array<{ label: string; category: string; subcategory: string | null }> = []

    for (const [categoryName, category] of Object.entries(budget)) {
      // Add category itself
      if (!excludeNoTime || getAvailableTime(budget, accumulatedTime, categoryName, null) > 0) {
        options.push({
          label: categoryName,
          category: categoryName,
          subcategory: null,
        })
      }

      // Add subcategories
      for (const subcategoryName of Object.keys(category.subcategories)) {
        if (
          !excludeNoTime ||
          getAvailableTime(budget, accumulatedTime, categoryName, subcategoryName) > 0
        ) {
          options.push({
            label: `${categoryName} → ${subcategoryName}`,
            category: categoryName,
            subcategory: subcategoryName,
          })
        }
      }
    }

    return options
  }

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
      timeAmount = ""
    }
  })

  function handleSourceChange(event: Event) {
    const target = event.target as HTMLSelectElement
    const value = target.value
    if (!value) {
      sourceCategory = ""
      sourceSubcategory = ""
      return
    }

    const option = getDropdownOptions(true).find(
      (opt) => `${opt.category}|${opt.subcategory || ""}` === value,
    )
    if (option) {
      sourceCategory = option.category
      sourceSubcategory = option.subcategory || ""
    }
  }

  function handleTargetChange(event: Event) {
    const target = event.target as HTMLSelectElement
    const value = target.value
    if (!value) {
      targetCategory = ""
      targetSubcategory = ""
      return
    }

    const option = getDropdownOptions(false).find(
      (opt) => `${opt.category}|${opt.subcategory || ""}` === value,
    )
    if (option) {
      targetCategory = option.category
      targetSubcategory = option.subcategory || ""
    }
  }

  function handleReallocation() {
    if (!sourceCategory || !targetCategory || !timeAmount.trim()) return

    try {
      const amount = parseTimeString(timeAmount)
      if (amount <= 0) {
        alert("Please enter a valid time amount")
        return
      }

      const validation = validateReallocation(
        budget,
        accumulatedTime,
        sourceCategory,
        sourceSubcategory || null,
        targetCategory,
        targetSubcategory || null,
        amount,
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
        amount,
      )

      onRealloc(newBudget)
      onClose()
    } catch (error) {
      console.error("Error reallocating time:", error)
      alert("Error processing reallocation")
    }
  }

  // Calculate preview budget for display
  let previewBudget = $derived.by(() => {
    if (!sourceCategory || !targetCategory || !timeAmount.trim()) {
      return budget
    }

    try {
      const amount = parseTimeString(timeAmount)
      if (amount <= 0) return budget

      const validation = validateReallocation(
        budget,
        accumulatedTime,
        sourceCategory,
        sourceSubcategory || null,
        targetCategory,
        targetSubcategory || null,
        amount,
      )

      if (!validation.valid) return budget

      return reallocateTime(
        budget,
        sourceCategory,
        sourceSubcategory || null,
        targetCategory,
        targetSubcategory || null,
        amount,
      )
    } catch {
      return budget
    }
  })

  // Calculate validation state for UI feedback
  let validationState = $derived.by(() => {
    if (!sourceCategory || !targetCategory || !timeAmount.trim()) {
      return { valid: true, error: null }
    }

    try {
      const amount = parseTimeString(timeAmount)
      if (amount <= 0) {
        return { valid: false, error: "Please enter a valid time amount" }
      }

      return validateReallocation(
        budget,
        accumulatedTime,
        sourceCategory,
        sourceSubcategory || null,
        targetCategory,
        targetSubcategory || null,
        amount,
      )
    } catch {
      return { valid: false, error: "Invalid time format" }
    }
  })
</script>

<dialog bind:this={dialog} class="modal w-full max-w-4xl rounded-lg p-6 shadow-xl">
  <div class="modal-content">
    <h2 class="mb-6 text-2xl font-bold">Reallocate Time</h2>

    <div class="mb-6 grid grid-cols-3 items-center gap-6">
      <!-- Source dropdown -->
      <div class="space-y-2">
        <label for="source-select" class="block text-sm font-medium">From:</label>
        <select
          id="source-select"
          class="w-full rounded border px-3 py-2"
          onchange={handleSourceChange}
        >
          <option value="">Select source...</option>
          {#each getDropdownOptions(true) as option}
            <option value={`${option.category}|${option.subcategory || ""}`}>
              {option.label}
            </option>
          {/each}
        </select>
        {#if sourceCategory}
          <div class="text-sm text-gray-600">
            Available: {fmtDuration(
              getAvailableTime(budget, accumulatedTime, sourceCategory, sourceSubcategory || null),
            )}
          </div>
        {/if}
      </div>

      <!-- Arrow and time input -->
      <div class="flex flex-col items-center space-y-2">
        <div class="text-2xl">→</div>
        <input
          type="text"
          placeholder="1h 30m"
          class="rounded border px-3 py-2 text-center {validationState.valid
            ? ''
            : 'border-red-500'}"
          bind:value={timeAmount}
        />
        <div class="text-xs text-gray-500">Format: 1h 30m</div>
        {#if !validationState.valid && validationState.error}
          <div class="text-xs text-red-600">{validationState.error}</div>
        {/if}
      </div>

      <!-- Target dropdown -->
      <div class="space-y-2">
        <label for="target-select" class="block text-sm font-medium">To:</label>
        <select
          id="target-select"
          class="w-full rounded border px-3 py-2"
          onchange={handleTargetChange}
        >
          <option value="">Select target...</option>
          {#each getDropdownOptions(false) as option}
            <option value={`${option.category}|${option.subcategory || ""}`}>
              {option.label}
            </option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Preview section -->
    {#if sourceCategory && targetCategory && timeAmount.trim()}
      <div class="mb-6 border-t pt-6">
        <h3 class="mb-4 text-lg font-semibold">Preview after reallocation:</h3>

        <div class="space-y-4">
          {#each Object.entries(previewBudget) as [categoryName, category]}
            {#if categoryName === sourceCategory || categoryName === targetCategory}
              <div class="rounded bg-gray-50 p-4">
                <h4 class="mb-2 font-medium">{categoryName}</h4>

                <!-- Category level progress -->
                <div class="mb-2">
                  <LabeledProgress
                    spent={accumulatedTime[categoryName] ?? 0}
                    budget={category.time -
                      Object.values(category.subcategories).reduce(
                        (sum: number, budget: number) => sum + budget,
                        0,
                      )}
                  >
                    Category Buffer
                  </LabeledProgress>
                </div>

                <!-- Subcategory progress bars - only show relevant ones -->
                {#each Object.entries(category.subcategories) as [subcategoryName, subcategoryBudget]}
                  {#if (categoryName === sourceCategory && (!sourceSubcategory || subcategoryName === sourceSubcategory)) || (categoryName === targetCategory && (!targetSubcategory || subcategoryName === targetSubcategory))}
                    <div class="ml-4">
                      <LabeledProgress
                        spent={accumulatedTime[categoryName + subcategoryName] ?? 0}
                        budget={subcategoryBudget}
                      >
                        {subcategoryName}
                      </LabeledProgress>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Action buttons -->
    <div class="flex justify-end space-x-3">
      <button class="rounded border px-4 py-2 hover:bg-gray-50" onclick={onClose}> Cancel </button>
      <button
        class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        onclick={handleReallocation}
        disabled={!sourceCategory ||
          !targetCategory ||
          !timeAmount.trim() ||
          !validationState.valid}
      >
        Reallocate Time
      </button>
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
</style>
