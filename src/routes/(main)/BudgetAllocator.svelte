<script lang="ts">
  import {
    accumulateTime,
    activeTimers,
    calculateCategoryOverage,
    calculateOverage,
    getUnallocatedTime,
    loadWeeklyBudgetConfig,
    saveWeeklyBudgetConfig,
    loadWeeklyData,
    getAvailableTime,
    reallocateTime,
    type AccumulatedTime,
  } from "$lib/budgetManager"
  import { db, exportSpentTime, type Budget } from "$lib/db"
  import { liveQuery } from "dexie"
  import LabeledProgress from "./LabeledProgress.svelte"
  import { resolve } from "$app/paths"
  import {
    daysOfWeek,
    MILLISECOND,
    MINUTE,
    nowMinutes,
    parseTimeString,
    fmtDuration,
  } from "$lib/time"
  import { ceilTo } from "$lib"

  let { eventChannel, selectedDay }: { eventChannel: EventTarget; selectedDay: number } = $props()

  let budget = $state<Budget[]>([])
  let accumulatedTime = $state({} as AccumulatedTime)
  let categoryOverages = $state({} as Record<string, number>)
  let unallocatedTime = $state(0)
  let scheduledTime = $state({} as Record<string, number>)
  let unallocatedScheduledTime = $state(0)
  let showReallocationMode = $state(false)
  let sourceSelection = $state<{ category: string | null; subcategory?: string } | null>(null)
  let targetSelection = $state<{ category: string | null; subcategory?: string } | null>(null)
  let reallocationAmount = $state(0)
  let reallocationAmountText = $state("")

  $effect(() => {
    if (reallocationAmount > maxReallocationAmount) reallocationAmount = maxReallocationAmount
  })

  async function setState() {
    if (budget.length === 0) {
      budget = await loadWeeklyBudgetConfig()
    }

    loadWeeklyData().then((data) => {
      accumulatedTime = accumulateTime(data)
      categoryOverages = calculateCategoryOverage(budget, accumulatedTime)
    })
    unallocatedTime = getUnallocatedTime(budget)
  }

  $effect(() => {
    const subscription = liveQuery(async () => {
      const todayDayIndex = new Date().getDay() - 1 // Monday=0, Sunday=-1 (matches Schedule.day)
      const todayStart = (() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        return d.getTime() * MILLISECOND
      })()

      const [schedules, todayEntries] = await Promise.all([
        db.schedule.toArray(),
        db.timeEntries.where("timestampStart").aboveOrEqual(todayStart).toArray(),
      ])

      const todaySpent: Record<string, number> = {}
      for (const entry of todayEntries) {
        if (entry.category && entry.subcategory) {
          const key = entry.category + entry.subcategory
          todaySpent[key] = (todaySpent[key] ?? 0) + (entry.duration ?? 0)
        }
      }

      const times: Record<string, number> = {}
      let unallocated = 0
      for (const s of schedules) {
        if (s.day < todayDayIndex) continue // past day, skip

        if (s.cat && s.subcat) {
          const key = s.cat + s.subcat
          let contribution = s.duration
          if (s.day === todayDayIndex) {
            contribution = Math.max(0, s.duration - (todaySpent[key] ?? 0))
          }
          times[key] = (times[key] ?? 0) + contribution
        } else {
          // TODO: there seems to be a bug where unallocated time is negative from scheduled time, shouldn't be
          unallocated += s.duration
        }
      }
      return { times, unallocated }
    }).subscribe({
      next: ({ times, unallocated }) => {
        scheduledTime = times
        unallocatedScheduledTime = unallocated
      },
    })
    return () => subscription.unsubscribe()
  })
  setState()

  eventChannel.addEventListener("budgetChanged", () => {
    budget = []
    setState()
  })

  function handleReallocationModeToggle() {
    showReallocationMode = !showReallocationMode
    if (!showReallocationMode) {
      // Reset selections when canceling
      sourceSelection = null
      targetSelection = null
      reallocationAmount = 0
      reallocationAmountText = ""
    }
  }

  function handleCategoryClick(category: string, subcategory?: string) {
    if (!showReallocationMode) {
      return
    }

    // Reallocation mode behavior
    const availableTime = getAvailableTime(budget, accumulatedTime, category, subcategory || null)

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

  function finishSubcat() {
    if (commitReallocation()) {
      if (!sourceSelection!.subcategory) {
        alert("You cannot finish a category, only subcategories")
        return
      }

      // delete subcategory from this week's budget
      const cat = budget.find((c) => c.name === sourceSelection!.category)!
      cat.subcategories = cat.subcategories.filter((s) => s.name !== sourceSelection!.subcategory)

      saveWeeklyBudgetConfig(budget)
      setState()

      // Reset reallocation mode
      handleReallocationModeToggle()
    }
  }

  function addSubcat() {
    const category = prompt("parent category name") // TODO: better way. Before I split management from tracking, used currentTasks[0]?.category
    if (!category) {
      alert("You must have a currently active task in the category you want to add")
    }
    const subcatName = prompt("New subcategory name")
    if (!subcatName) return
    budget
      .find((c) => c.name === category)!
      .subcategories.push({ name: subcatName, time: 0, total: false })
  }

  function handleUnallocatedClick() {
    if (!showReallocationMode) return

    const selection = { category: null, subcategory: undefined }
    const availableTime = getAvailableTime(budget, accumulatedTime, null, null)

    if (!sourceSelection) {
      // For source selection, must have available time
      if (availableTime <= 0) return
      sourceSelection = selection
    } else if (!targetSelection && sourceSelection.category !== null) {
      // For target selection, can always select (only if source is not also unallocated)
      targetSelection = selection
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

      budget = newBudget
      saveWeeklyBudgetConfig(newBudget)
      setState()

      // Caller must invoke `handleReallocationModeToggle`
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
    return Math.floor(
      getAvailableTime(
        budget,
        accumulatedTime,
        sourceSelection.category,
        sourceSelection.subcategory || null,
      ),
    )
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
</script>

{#if showReallocationMode}
  <div class="fixed top-0 right-0 left-0 z-50 border-b bg-white p-4 shadow-lg">
    <div class="mx-auto max-w-4xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">Rebudget Time</h3>
        <div class="flex space-x-2">
          <button
            class="rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50"
            onclick={() => {
              commitReallocation()
              handleReallocationModeToggle()
            }}
            disabled={!sourceSelection || !targetSelection || reallocationAmount <= 0}
          >
            Commit
          </button>
          <button class="rounded border px-3 py-1" onclick={handleReallocationModeToggle}>
            Cancel
          </button>
        </div>
      </div>

      <div class="flex items-center space-x-4">
        <div class="flex-1">
          <input
            type="range"
            min="0"
            max={ceilTo(maxReallocationAmount, 15)}
            step={15 * MINUTE}
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
          <button class="rounded bg-green-600 px-3 py-1 text-white" onclick={finishSubcat}>
            Finish
          </button>
        {/if}
      </div>

      {#if sourceSelection || targetSelection}
        <div class="mt-2 text-sm text-gray-600">
          {#if sourceSelection}
            From: {sourceSelection.category ?? "Unallocated"}{sourceSelection.subcategory
              ? ` → ${sourceSelection.subcategory}`
              : ""}
          {/if}
          {#if targetSelection}
            | To: {targetSelection.category ?? "Unallocated"}{targetSelection.subcategory
              ? ` → ${targetSelection.subcategory}`
              : ""}
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if !showReallocationMode}
  <div class="pb-1.5">
    <div class="flex justify-around">
      Editing {daysOfWeek[selectedDay]}
      <button class="border" onclick={handleReallocationModeToggle}>Rebudget</button>
    </div>
  </div>
{/if}

<div class="flex flex-col gap-5 {showReallocationMode ? 'mt-32' : ''}">
  {#each showReallocationMode ? previewBudget : budget as category}
    {@const categoryName = category.name}
    {@const categoryAvailable = getAvailableTime(budget, accumulatedTime, categoryName, null)}
    {@const isSourceCategory =
      sourceSelection?.category === categoryName && !sourceSelection.subcategory}
    {@const isTargetCategory =
      targetSelection?.category === categoryName && !targetSelection.subcategory}
    {@const hasSelectedSubcategory =
      (sourceSelection?.category === categoryName && sourceSelection.subcategory) ||
      (targetSelection?.category === categoryName && targetSelection.subcategory)}
    {@const isCategoryDisabled = showReallocationMode && !sourceSelection && categoryAvailable <= 0}

    {@const totalCategorySpillover =
      category.time - category.subcategories.reduce((sum, s) => sum + s.time, 0)}
    {@const totalSubcategoryOverage = categoryOverages[categoryName] ?? 0}
    {@const poolAllocated = Math.min(totalSubcategoryOverage, totalCategorySpillover)}
    {@const remainingCategorySpillover = Math.max(
      0,
      totalCategorySpillover - totalSubcategoryOverage,
    )}
    {@const unallocatedOverage = calculateOverage(
      showReallocationMode ? previewBudget : budget,
      accumulatedTime,
    )}
    {@const remainingUnallocated = Math.max(
      0,
      unallocatedTime - (unallocatedOverage + unallocatedScheduledTime),
    )}

    <div
      class="block {isSourceCategory || isTargetCategory || hasSelectedSubcategory
        ? 'rounded border bg-white p-2'
        : ''}"
    >
      <div
        class="px-3 py-1 {showReallocationMode
          ? !sourceSelection && categoryAvailable <= 0
            ? 'cursor-not-allowed opacity-50 grayscale'
            : 'cursor-pointer'
          : ''}"
        role={showReallocationMode && !(!sourceSelection && categoryAvailable <= 0)
          ? "button"
          : undefined}
        onclick={showReallocationMode && !(!sourceSelection && categoryAvailable <= 0)
          ? () => handleCategoryClick(categoryName)
          : undefined}
      >
        <h2
          class="flex justify-between text-xl font-bold {isSourceCategory
            ? 'text-blue-600'
            : isTargetCategory
              ? 'text-green-600'
              : ''}"
        >
          <span>{categoryName}</span>
          <span>
            {fmtDuration(
              category.time -
                Object.values(category.subcategories).reduce((sum, budget) => sum + budget.time, 0),
            )}
          </span>
        </h2>
      </div>

      {#each category.subcategories as sub}
        {@const subcategoryName = sub.name}
        {@const subcategoryBudget = sub.time}
        {@const subcategoryAvailable = getAvailableTime(
          budget,
          accumulatedTime,
          categoryName,
          subcategoryName,
        )}
        {@const isSourceSubcategory =
          sourceSelection?.category === categoryName &&
          sourceSelection?.subcategory === subcategoryName}
        {@const isTargetSubcategory =
          targetSelection?.category === categoryName &&
          targetSelection?.subcategory === subcategoryName}

        {@const isDisabled = showReallocationMode && !sourceSelection && subcategoryAvailable <= 0}
        {@const subcategoryOverage = Math.max(
          0,
          (accumulatedTime[categoryName + subcategoryName] ?? 0) - subcategoryBudget,
        )}
        {@const categorySpilloverForThis =
          totalSubcategoryOverage > 0
            ? (subcategoryOverage / totalSubcategoryOverage) * poolAllocated
            : 0}
        {@const subcategorySpent = accumulatedTime[categoryName + subcategoryName] ?? 0}
        {@const subcategoryScheduled = scheduledTime[categoryName + subcategoryName] ?? 0}

        <div
          class="{isSourceSubcategory || isTargetSubcategory
            ? 'ml-2 rounded border bg-white p-1'
            : ''} {isDisabled ? 'opacity-50 grayscale' : ''}"
        >
          <LabeledProgress
            spent={subcategorySpent + subcategoryScheduled}
            overlayStart={subcategoryScheduled > 0 ? subcategorySpent : undefined}
            budget={subcategoryBudget}
            {totalCategorySpillover}
            {categorySpilloverForThis}
            {remainingCategorySpillover}
            {remainingUnallocated}
            style={showReallocationMode
              ? !sourceSelection && subcategoryAvailable <= 0
                ? "cursor-not-allowed"
                : "cursor-pointer"
              : "cursor-pointer"}
            onclick={() => handleCategoryClick(categoryName, subcategoryName)}
          >
            {#if isSourceSubcategory}
              🔵
            {:else if isTargetSubcategory}
              🟢
            {/if}
            {subcategoryName}
          </LabeledProgress>
        </div>
      {/each}
    </div>
  {/each}

  {#snippet unallocatedSection()}
    {@const unallocatedAvailable = getAvailableTime(budget, accumulatedTime, null, null)}
    {@const isSourceUnallocated = sourceSelection?.category === null}
    {@const isTargetUnallocated = targetSelection?.category === null}
    {@const isUnallocatedDisabled =
      showReallocationMode && !sourceSelection && unallocatedAvailable <= 0}

    {@const unallocatedSpent = calculateOverage(budget, accumulatedTime)}
    <div class={isSourceUnallocated || isTargetUnallocated ? "rounded border bg-white p-2" : ""}>
      <LabeledProgress
        spent={unallocatedSpent + unallocatedScheduledTime}
        overlayStart={unallocatedScheduledTime > 0 ? unallocatedSpent : undefined}
        budget={unallocatedTime}
        style={showReallocationMode
          ? !sourceSelection && unallocatedAvailable <= 0
            ? "cursor-not-allowed opacity-50 grayscale"
            : "cursor-pointer"
          : ""}
        onclick={showReallocationMode && !isUnallocatedDisabled
          ? handleUnallocatedClick
          : undefined}
      >
        <h2
          class="font-bold {isSourceUnallocated
            ? 'text-blue-600'
            : isTargetUnallocated
              ? 'text-green-600'
              : ''}"
        >
          {#if isSourceUnallocated}
            🔵
          {:else if isTargetUnallocated}
            🟢
          {/if}
          Unallocated time
        </h2>
      </LabeledProgress>
    </div>
  {/snippet}

  {@render unallocatedSection()}
</div>

<div class="text-center">
  <button class="border" onclick={addSubcat}>Add subcat</button>
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
