<script lang="ts">
  import {
    accumulateTime,
    activeTimers,
    calculateCategoryOverage,
    calculateGapTime,
    calculateOverage,
    getUnallocatedTime,
    loadWeeklyBudgetConfig,
    saveWeeklyBudgetConfig,
    loadWeeklyData,
    getAvailableTime,
    reallocateTime,
    type AccumulatedTime,
  } from "$lib/budgetManager"
  import { db, exportSpentTime, type Budget, Leftovers } from "$lib/db"
  import { liveQuery } from "dexie"
  import LabeledProgress from "./LabeledProgress.svelte"
  import { resolve } from "$app/paths"
  import {
    daysOfWeek,
    MILLISECOND,
    MINUTE,
    WEEK,
    DAY,
    nowMinutes,
    parseDuration,
    fmtDuration,
    shiftWeekday,
    getWeekStart,
  } from "$lib/time"
  import { ceilTo } from "$lib"
  import { onDestroy } from "svelte"

  let { eventChannel, selectedDay }: { eventChannel: EventTarget; selectedDay: number } = $props()

  let budget = $state<Budget[]>([])
  let accumulatedTime = $state({} as AccumulatedTime)

  let _activeTasks = liveQuery(() => activeTimers())
  let activeTasks = $derived($_activeTasks || [])
  let now = $state(nowMinutes())
  const ticker = setInterval(() => {
    now = nowMinutes()
  }, 30_000)
  onDestroy(() => clearInterval(ticker))

  let effectiveAccumulatedTime = $derived.by(() => {
    const result = { ...accumulatedTime }
    for (const task of activeTasks) {
      if (task.category && task.subcategory) {
        const key = task.category + task.subcategory
        result[key] = (result[key] ?? 0) + Math.max(0, now - task.timestampStart)
      }
    }
    return result
  })
  let effectiveCategoryOverages = $derived(
    calculateCategoryOverage(budget, effectiveAccumulatedTime),
  )
  let categoryOverages = $state({} as Record<string, number>)
  let unallocatedTime = $state(0)
  let scheduledTime = $state({} as Record<string, number>)
  let unallocatedScheduledTime = $state(0)
  let showReallocationMode = $state(false)
  let sourceSelection = $state<{ category: string | null; subcategory?: string } | null>(null)
  let targetSelection = $state<{ category: string | null; subcategory?: string } | null>(null)
  let reallocationAmount = $state(0)
  let reallocationAmountText = $state("")

  // Temp insights, see which are useful
  let schedule = liveQuery(() => db.schedule.toArray())
  let timeEntries = liveQuery(() => db.timeEntries.toArray())

  // Gap time: periods between consecutive time entries with no task running count as unallocated
  let weeklyGapTime = $derived.by(() => {
    const weekStart = getWeekStart()
    const entries = ($timeEntries ?? []).filter((e) => e.timestampStart >= weekStart)
    return calculateGapTime(entries, getWeekStart())
  })

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
      const todayDayIndex = shiftWeekday(new Date().getDay())
      const todayStart = (() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        return d.getTime() * MILLISECOND
      })()

      const [schedules, todayEntries] = await Promise.all([
        db.schedule.toArray(),
        db.timeEntries
          .where("timestampStart")
          .between(todayStart, getWeekStart() + WEEK)
          .toArray(),
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

  eventChannel.addEventListener("scheduleClicked", (ev) => {
    const detail = (ev as CustomEvent).detail
    handleCategoryClick(detail.cat, detail.subcat)
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

  async function handleCategoryClick(category: string, subcategory?: string) {
    if (!showReallocationMode) {
      const scheduleToday = await db.schedule
        .where({ day: selectedDay, cat: category, subcat: subcategory })
        .toArray()

      // Get scheduled time for today
      const allCalendarTimeToday = scheduleToday
        .filter((event) => event.calId)
        .reduce((acc, event) => acc + event.duration, 0)

      // Since calendar time can only be changed from the calendar, this is the amound of time that can be changed from the UI
      // There should only be one manually defined (non-event) schedule per subcat per day
      const generalScheduleToday = scheduleToday.find((event) => !event.calId) ?? {
        day: selectedDay,
        duration: 0,
        calId: "",
        leftovers: Leftovers.ROLLOVER,
        cat: category,
        subcat: subcategory as string,
      }
      const scheduledTimeToday = generalScheduleToday.duration

      // Visually check subcat allocator multibar to see remaining time total
      // Visually check "Unallocated time" on tracker page for free time available today. Wasn't worth bringing all that logic here
      // Visually check subcat tracker multibar for time over/under scheduled time today

      // Prompt user
      const response = prompt(
        `Editing scheduled time on ${daysOfWeek[selectedDay]} for ${subcategory}\n\n` +
          `From synced calendar (cannot edit here): ${fmtDuration(allCalendarTimeToday)}\n` +
          `General scheduled time: ${fmtDuration(scheduledTimeToday)}\n` +
          `Total scheduled time: ${fmtDuration(scheduledTimeToday + allCalendarTimeToday)}\n` +
          `How much time do you want to schedule? (prepend +/- for relative time)`,
        fmtDuration(scheduledTimeToday),
      )
      if (!response) return

      let responseMins = parseDuration(response)

      // Calculate relative time
      if (response[0] === "+" || response[0] === "-")
        responseMins = scheduledTimeToday + responseMins
      else responseMins = Math.abs(responseMins)
      responseMins = Math.max(0, responseMins)

      generalScheduleToday.duration = responseMins

      // User provided an invalid time
      if (generalScheduleToday.duration === 0 && response[0] != "0")
        handleCategoryClick(category, subcategory)
      else await db.schedule.put(generalScheduleToday)

      return
    }

    // Reallocation mode behavior
    const availableTime = getAvailableTime(
      budget,
      effectiveAccumulatedTime,
      category,
      subcategory || null,
    )

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
    const availableTime = getAvailableTime(budget, effectiveAccumulatedTime, null, null)

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
      const parsed = parseDuration(reallocationAmountText)
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
        effectiveAccumulatedTime,
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
    {@const categoryAvailable = getAvailableTime(
      budget,
      effectiveAccumulatedTime,
      categoryName,
      null,
    )}
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
    {@const totalSubcategoryOverage = category.subcategories.reduce((sum, s) => {
      const subKey = categoryName + s.name
      const projected = (effectiveAccumulatedTime[subKey] ?? 0) + (scheduledTime[subKey] ?? 0)
      return sum + Math.max(0, projected - s.time)
    }, 0)}
    {@const poolAllocated = Math.min(totalSubcategoryOverage, totalCategorySpillover)}
    {@const remainingCategorySpillover = Math.max(
      0,
      totalCategorySpillover - totalSubcategoryOverage,
    )}
    {@const unallocatedOverage = calculateOverage(
      showReallocationMode ? previewBudget : budget,
      effectiveAccumulatedTime,
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
          effectiveAccumulatedTime,
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
          (effectiveAccumulatedTime[categoryName + subcategoryName] ?? 0) +
            (scheduledTime[categoryName + subcategoryName] ?? 0) -
            subcategoryBudget,
        )}
        {@const categorySpilloverForThis =
          totalSubcategoryOverage > 0
            ? (subcategoryOverage / totalSubcategoryOverage) * poolAllocated
            : 0}
        {@const subcategorySpent = effectiveAccumulatedTime[categoryName + subcategoryName] ?? 0}
        {@const subcategoryScheduled = scheduledTime[categoryName + subcategoryName] ?? 0}

        <div
          class="{isSourceSubcategory || isTargetSubcategory
            ? 'ml-2 rounded border bg-white p-1'
            : ''} {isDisabled ? 'opacity-50 grayscale' : ''}"
        >
          <LabeledProgress
            spent={subcategorySpent + subcategoryScheduled}
            overlayStart={subcategorySpent > 0 || subcategoryScheduled > 0
              ? subcategorySpent
              : undefined}
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
          <div class="mt-[-6px] mb-1.5">
            pace: {fmtDuration(
              ($timeEntries ?? [])
                .filter(
                  (ev) =>
                    ev.category === categoryName &&
                    ev.subcategory === subcategoryName &&
                    shiftWeekday(new Date(ev.timestampStart / MILLISECOND).getDay()) <
                      shiftWeekday(new Date().getDay()),
                )
                .reduce((acc, ev) => acc + (ev?.duration ?? 0), 0) -
                ($schedule ?? [])
                  .filter(
                    (ev) =>
                      ev.day < shiftWeekday(new Date().getDay()) &&
                      ev.cat === categoryName &&
                      ev.subcat === subcategoryName,
                  )
                  .reduce((acc, ev) => acc + (ev?.duration ?? 0), 0),
            )}<br />
            scheduled: {fmtDuration(subcategoryScheduled)}<br />
            {#each Array.from({ length: 7 }) as _, idx}
              {#if idx < shiftWeekday(new Date().getDay())}
                {@const d = ($timeEntries ?? [])
                  .filter(
                    (ev) =>
                      ev.category === categoryName &&
                      ev.subcategory === subcategoryName &&
                      shiftWeekday(new Date(ev.timestampStart / MILLISECOND).getDay()) === idx,
                  )
                  .reduce((acc, ev) => acc + (ev?.duration ?? 0), 0)}
                {#if d > 0}
                  {["M", "T", "W", "R", "F", "S", "J"][idx]}:
                  {fmtDuration(d)}
                  <br />
                {/if}
              {:else}
                {@const todaySchedule = ($schedule ?? []).filter(
                  (ev) =>
                    ev.cat === categoryName && ev.subcat === subcategoryName && ev.day === idx,
                )}
                {@const d = todaySchedule.reduce((acc, ev) => acc + (ev?.duration ?? 0), 0)}
                {#if d > 0}
                  {["M", "T", "W", "R", "F", "S", "J"][idx]}:
                  {fmtDuration(d)}
                  ({todaySchedule.map((ev) => ev.name ?? ev.subcat).join(", ")})
                  <br />
                {/if}
              {/if}
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/each}

  {#snippet unallocatedSection()}
    {@const unallocatedAvailable = getAvailableTime(budget, effectiveAccumulatedTime, null, null)}
    {@const isSourceUnallocated = sourceSelection?.category === null}
    {@const isTargetUnallocated = targetSelection?.category === null}
    {@const isUnallocatedDisabled =
      showReallocationMode && !sourceSelection && unallocatedAvailable <= 0}

    {@const unallocatedSpent = calculateOverage(budget, effectiveAccumulatedTime) + weeklyGapTime}
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
