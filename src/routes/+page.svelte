<script lang="ts">
  import { onMount } from "svelte"
  import type { BudgetConfig, WeeklyTimeData, CategoryProgress } from "$lib/types"
  import {
    loadBudgetConfig,
    loadWeeklyData,
    startTimer,
    calculateProgress,
    formatDuration,
    getActiveTimer,
    debugTimerState,
  } from "$lib/utils/timeManager"

  let budgetConfig: BudgetConfig = {}
  let weeklyData: WeeklyTimeData = {
    weekStart: "",
    entries: [],
    activeTimer: null,
  }
  let progress: CategoryProgress[] = []
  let activeTimer: { category: string; subcategory: string } | null = null

  // Update progress every second to show live timer
  let progressUpdateInterval: number

  function updateProgress() {
    progress = calculateProgress(budgetConfig, weeklyData)
    const fullActiveTimer = getActiveTimer(weeklyData)
    activeTimer = fullActiveTimer
      ? {
          category: fullActiveTimer.category,
          subcategory: fullActiveTimer.subcategory,
        }
      : null
  }

  function handleTimerClick(category: string, subcategory: string) {
    // Find the first event in this subcategory to start timing (events are internal only)
    const firstEvent = Object.keys(budgetConfig[category]?.[subcategory] || {})[0]
    if (!firstEvent) return

    // Don't restart the same timer
    if (
      activeTimer &&
      activeTimer.category === category &&
      activeTimer.subcategory === subcategory
    ) {
      return
    }

    weeklyData = startTimer(weeklyData, category, subcategory, firstEvent)
    updateProgress()
  }

  function groupProgressByCategory() {
    const grouped: { [key: string]: CategoryProgress[] } = {}

    // Group events by category and subcategory, combining their budgets and usage
    const subcategoryMap: { [key: string]: CategoryProgress } = {}

    progress.forEach((item) => {
      const key = `${item.category}::${item.subcategory}`

      if (!subcategoryMap[key]) {
        subcategoryMap[key] = {
          category: item.category,
          subcategory: item.subcategory,
          eventName: "", // Not used for subcategory-level display
          budgeted: 0,
          used: 0,
          percentage: 0,
        }
      }

      subcategoryMap[key].budgeted += item.budgeted
      subcategoryMap[key].used += item.used
    })

    // Calculate percentages for combined subcategories
    Object.values(subcategoryMap).forEach((item) => {
      item.percentage = item.budgeted > 0 ? Math.min((item.used / item.budgeted) * 100, 100) : 0
    })

    // Group by category
    Object.values(subcategoryMap).forEach((item) => {
      if (!grouped[item.category]) {
        grouped[item.category] = []
      }
      grouped[item.category].push(item)
    })

    // Ensure all categories from budget config are represented
    Object.keys(budgetConfig).forEach((category) => {
      if (!grouped[category]) {
        grouped[category] = []
      }
    })

    return grouped
  }

  function isActiveTimer(category: string, subcategory: string): boolean {
    return (
      activeTimer !== null &&
      activeTimer.category === category &&
      activeTimer.subcategory === subcategory
    )
  }

  function getProgressBarColor(percentage: number, isActive: boolean): string {
    if (isActive) {
      return "bg-blue-500"
    } else if (percentage >= 100) {
      return "bg-red-500"
    } else if (percentage >= 75) {
      return "bg-yellow-500"
    } else {
      return "bg-green-500"
    }
  }

  onMount(() => {
    console.log("=== PAGE LOAD DEBUG ===")
    debugTimerState()

    budgetConfig = loadBudgetConfig()
    weeklyData = loadWeeklyData()

    console.log("Budget config loaded:", budgetConfig)
    console.log("Weekly data loaded:", weeklyData)
    console.log("Weekly data activeTimer:", weeklyData.activeTimer)

    updateProgress()

    console.log("Progress calculated:", progress)

    // Update progress every second to show live timer
    progressUpdateInterval = setInterval(() => {
      if (weeklyData.activeTimer) {
        updateProgress()
      }
    }, 1000)

    // Handle page visibility changes to preserve timer
    const handleVisibilityChange = () => {
      if (document.hidden && weeklyData.activeTimer) {
        console.log("Page hidden, saving timer state")
        // Timer state is already being saved by saveWeeklyData in updateProgress
      } else if (!document.hidden && weeklyData.activeTimer) {
        console.log("Page visible, timer still active")
      }
    }

    // Handle page unload to preserve timer
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (weeklyData.activeTimer) {
        console.log("Page unloading with active timer, state preserved")
        // Don't prevent unload, just ensure state is saved
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval)
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  })
</script>

<svelte:head>
  <title>Time Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-4">
  <div class="mx-auto max-w-4xl">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Time Budget Tracker</h1>
        <p class="mt-1 text-gray-600">
          Week starting {new Date(weeklyData.weekStart).toLocaleDateString()}
        </p>
      </div>
      <a
        href="/settings"
        class="rounded-full bg-white p-3 text-2xl shadow-md transition-shadow duration-200 hover:shadow-lg"
        title="Settings"
      >
        ⚙️
      </a>
    </div>

    <!-- Active Timer Display -->
    {#if activeTimer}
      <div class="mb-6 rounded border-l-4 border-blue-500 bg-blue-100 p-4">
        <div class="flex items-center">
          <div class="mr-3 h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
          <p class="font-medium text-blue-800">
            Currently tracking: <strong>{activeTimer.category}</strong> →
            <strong>{activeTimer.subcategory}</strong>
          </p>
        </div>
      </div>
    {/if}

    <!-- Progress Bars by Category -->
    <div class="space-y-8">
      {#each Object.entries(groupProgressByCategory()) as [categoryName, categoryItems]}
        <div class="rounded-lg bg-white p-6 shadow-md">
          <h2 class="mb-4 text-xl font-semibold text-gray-800">{categoryName}</h2>

          <div class="space-y-4">
            {#each categoryItems as item}
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-2">
                    <span class="text-sm font-medium text-gray-700">
                      {item.subcategory}
                    </span>
                    {#if isActiveTimer(item.category, item.subcategory)}
                      <span
                        class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
                      >
                        Active
                      </span>
                    {/if}
                  </div>
                  <span class="text-sm text-gray-500">
                    {formatDuration(item.used)} / {formatDuration(item.budgeted)}
                  </span>
                </div>

                <!-- Clickable Progress Bar -->
                <button
                  class="h-6 w-full overflow-hidden rounded-full bg-gray-200 transition-colors duration-200 hover:bg-gray-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
                  on:click={() => handleTimerClick(item.category, item.subcategory)}
                  title="Click to start tracking this activity"
                >
                  <div
                    class="flex h-full items-center justify-center text-xs font-medium text-white transition-all duration-300 ease-out {getProgressBarColor(
                      item.percentage,
                      isActiveTimer(item.category, item.subcategory),
                    )}"
                    style="width: {Math.max(item.percentage, 5)}%"
                  >
                    {#if item.percentage > 15}
                      {item.percentage.toFixed(0)}%
                    {/if}
                  </div>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    {#if Object.keys(budgetConfig).length === 0}
      <div class="py-12 text-center">
        <p class="mb-4 text-gray-500">No budget configured yet.</p>
        <a
          href="/settings"
          class="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors duration-200 hover:bg-blue-700"
        >
          Configure Budget ⚙️
        </a>
      </div>
    {:else if Object.keys(groupProgressByCategory()).length === 0}
      <div class="py-12 text-center">
        <p class="mb-4 text-gray-500">Budget loaded but no progress to display.</p>
        <p class="text-sm text-gray-400">
          Try refreshing the page or check the console for errors.
        </p>
      </div>
    {/if}
  </div>
</div>
