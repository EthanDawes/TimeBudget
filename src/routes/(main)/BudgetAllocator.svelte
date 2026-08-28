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
  import { computeCategoryProgress } from "$lib/budgetCalculations"
  import BudgetProgressView from "./BudgetProgressView.svelte"
  import { db, type Budget, Leftovers } from "$lib/db"
  import { liveQuery } from "dexie"
  import {
    daysOfWeek,
    MILLISECOND,
    MINUTE,
    WEEK,
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
  let _timeEntries = liveQuery(() =>
    db.timeEntries
      .where("timestampStart")
      .between(getWeekStart(), getWeekStart() + WEEK) // Upper bound is useful if looking back in time
      .toArray(),
  )
  let timeEntries = $derived($_timeEntries ?? [])

  // Gap time: periods between consecutive time entries with no task running count as unallocated
  let weeklyGapTime = $derived(calculateGapTime(timeEntries, getWeekStart()))

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
    const category = prompt("parent category name")
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

  $effect(() => {
    try {
      reallocationAmount = parseDuration(reallocationAmountText)
    } catch {
      // Invalid format, keep current amount
    }
  })

  $effect(() => {
    reallocationAmountText = fmtDuration(reallocationAmount)
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

  let activeBudget = $derived(showReallocationMode ? previewBudget : budget)
  let unallocatedSpent = $derived(
    calculateOverage(activeBudget, effectiveAccumulatedTime) + weeklyGapTime,
  )

  let progressData = $derived(
    computeCategoryProgress({
      categories: activeBudget,
      spentBySubcategory: effectiveAccumulatedTime,
      scheduledBySubcategory: scheduledTime,
      unallocatedBudget: unallocatedTime,
      unallocatedSpent,
      unallocatedScheduled: unallocatedScheduledTime,
      keyFormat: "concat",
    }),
  )

  // Selection state helpers
  const isSourceCategory = (catName: string) =>
    sourceSelection?.category === catName && !sourceSelection.subcategory
  const isTargetCategory = (catName: string) =>
    targetSelection?.category === catName && !targetSelection.subcategory
  const hasSelectedSubcategory = (catName: string) =>
    (sourceSelection?.category === catName && !!sourceSelection.subcategory) ||
    (targetSelection?.category === catName && !!targetSelection.subcategory)
  const isCategoryDisabled = (catName: string) => {
    if (!showReallocationMode || sourceSelection) return false
    return getAvailableTime(budget, effectiveAccumulatedTime, catName, null) <= 0
  }

  const isSourceSubcategory = (catName: string, subName: string) =>
    sourceSelection?.category === catName && sourceSelection?.subcategory === subName
  const isTargetSubcategory = (catName: string, subName: string) =>
    targetSelection?.category === catName && targetSelection?.subcategory === subName
  const isSubcategoryDisabled = (catName: string, subName: string) => {
    if (!showReallocationMode || sourceSelection) return false
    return getAvailableTime(budget, effectiveAccumulatedTime, catName, subName) <= 0
  }

  let isSourceUnallocated = $derived(sourceSelection?.category === null)
  let isTargetUnallocated = $derived(targetSelection?.category === null)
  let isUnallocatedDisabled = $derived.by(() => {
    if (!showReallocationMode || sourceSelection) return false
    return getAvailableTime(budget, effectiveAccumulatedTime, null, null) <= 0
  })

  async function handleContextClick(categoryName: string, subcategoryName: string | null) {
    const labels = ["M", "T", "W", "R", "F", "S", "J"]
    const today = shiftWeekday(new Date().getDay())

    const spentDaily = labels.map((_, idx) => {
      if (idx > today) return 0
      const d = timeEntries
        .filter(
          (ev) =>
            ev.category === categoryName &&
            ev.subcategory === subcategoryName &&
            shiftWeekday(new Date(ev.timestampStart / MILLISECOND).getDay()) === idx,
        )
        .reduce((acc, ev) => acc + (ev?.duration ?? 0), 0)

      return Math.max(0, d)
    })

    const schedule = await db.schedule.toArray()
    const budgetedDaily = labels.map((_, idx) => {
      const todaySchedule = schedule.filter(
        (ev) => ev.cat === categoryName && ev.subcat === subcategoryName && ev.day === idx,
      )

      const d = todaySchedule.reduce((acc, ev) => acc + (ev?.duration ?? 0), 0)

      return Math.max(0, d)
    })

    const scheduled = labels.map(
      (day, idx) => `Scheduled ${day} ${fmtDuration(budgetedDaily[idx])}`,
    )

    const spent = labels
      .slice(0, today + 1)
      .map(
        (day, idx) =>
          `Spent ${day} ${fmtDuration(spentDaily[idx])} / ${fmtDuration(budgetedDaily[idx])} ${fmtDuration((budgetedDaily[idx] - spentDaily[idx]) * -1, true)}`,
      )

    alert([...scheduled, ...spent].join("\n"))
  }
</script>

{#snippet topSection()}
  {#if showReallocationMode}
    <div
      class="fixed top-0 right-0 left-0 z-50 border-b bg-white p-4 shadow-lg"
      style="width: calc(90% - 400px)"
    >
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
  {:else}
    <div class="pb-1.5">
      <div class="flex justify-around">
        Editing {daysOfWeek[selectedDay]}
        <button class="border" onclick={handleReallocationModeToggle}>Rebudget</button>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet subcategoryPrefix(sub: { name: string }, cat: { name: string })}
  {#if isSourceSubcategory(cat.name, sub.name)}
    🔵
  {:else if isTargetSubcategory(cat.name, sub.name)}
    🟢
  {/if}
{/snippet}

{#snippet unallocatedPrefix()}
  {#if isSourceUnallocated}
    🔵
  {:else if isTargetUnallocated}
    🟢
  {/if}
{/snippet}

{#snippet footerExtras()}
  <button class="border" onclick={addSubcat}>Add subcat</button>
{/snippet}

<BudgetProgressView
  categories={progressData.categories}
  unallocated={progressData.unallocated}
  isMultiBar={true}
  top={topSection}
  {subcategoryPrefix}
  {unallocatedPrefix}
  {footerExtras}
  getCategoryClass={(cat) =>
    isSourceCategory(cat.name) ||
    isTargetCategory(cat.name) ||
    hasSelectedSubcategory(cat.name)
      ? "rounded border bg-white p-2"
      : ""}
  getCategoryHeaderClass={(cat) =>
    showReallocationMode
      ? isCategoryDisabled(cat.name)
        ? "cursor-not-allowed opacity-50 grayscale"
        : "cursor-pointer"
      : ""}
  getCategoryHeaderTitleClass={(cat) =>
    isSourceCategory(cat.name)
      ? "text-blue-600"
      : isTargetCategory(cat.name)
        ? "text-green-600"
        : ""}
  getSubcategoryContainerClass={(sub, cat) =>
    `${
      isSourceSubcategory(cat.name, sub.name) || isTargetSubcategory(cat.name, sub.name)
        ? "ml-2 rounded border bg-white p-1"
        : ""
    } ${isSubcategoryDisabled(cat.name, sub.name) ? "opacity-50 grayscale" : ""}`}
  getSubcategoryProgressStyle={(sub, cat) =>
    showReallocationMode && isSubcategoryDisabled(cat.name, sub.name)
      ? "cursor-not-allowed"
      : "cursor-pointer"}
  getUnallocatedContainerClass={() =>
    isSourceUnallocated || isTargetUnallocated ? "rounded border bg-white p-2" : ""}
  getUnallocatedProgressStyle={() =>
    showReallocationMode
      ? isUnallocatedDisabled
        ? "cursor-not-allowed opacity-50 grayscale"
        : "cursor-pointer"
      : ""}
  getUnallocatedTitleClass={() =>
    isSourceUnallocated
      ? "text-blue-600"
      : isTargetUnallocated
        ? "text-green-600"
        : ""}
  onCategoryClick={(cat) => {
    if (showReallocationMode && !isCategoryDisabled(cat.name)) {
      handleCategoryClick(cat.name)
    }
  }}
  onSubcategoryClick={(sub, cat) => handleCategoryClick(cat.name, sub.name)}
  onSubcategoryContextMenu={(sub, cat) => handleContextClick(cat.name, sub.name)}
  onUnallocatedClick={() => {
    if (showReallocationMode && !isUnallocatedDisabled) {
      handleUnallocatedClick()
    }
  }}
/>
