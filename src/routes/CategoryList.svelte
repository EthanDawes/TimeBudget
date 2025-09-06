<script lang="ts">
  import { fmtDuration, nowMinutes } from "$lib/time"
  import type { BudgetConfig, AccumulatedTime } from "$lib/budgetManager"
  import { calculateCategoryOverage } from "$lib/budgetManager"
  import LabeledProgress from "./LabeledProgress.svelte"
  import type { TimeEntry } from "$lib/db"

  interface CategoryListProps {
    budget: BudgetConfig
    accumulatedTime: AccumulatedTime
    currentTask?: TimeEntry
    onItemClick?: (category: string, subcategory: string) => void
    filterZeroTime?: boolean
    selectedCategory?: string
    selectedSubcategory?: string
  }

  let {
    budget,
    accumulatedTime,
    currentTask,
    onItemClick,
    filterZeroTime = false,
    selectedCategory = "",
    selectedSubcategory = "",
  }: CategoryListProps = $props()

  let categoryOverages = $derived(calculateCategoryOverage(budget, accumulatedTime))

  function getAvailableTime(category: string, subcategory?: string): number {
    const key = subcategory ? category + subcategory : category
    const spent = accumulatedTime[key] ?? 0

    if (subcategory) {
      const allocated = budget[category].subcategories[subcategory]
      return Math.max(0, allocated - spent)
    } else {
      const totalSubcategoryBudget = Object.values(budget[category].subcategories).reduce(
        (sum, budget) => sum + budget,
        0,
      )
      const categoryBuffer = budget[category].time - totalSubcategoryBudget
      const categorySpent = accumulatedTime[category] ?? 0
      const remainingCategoryTime = Math.max(0, budget[category].time - categorySpent)
      return Math.min(categoryBuffer, remainingCategoryTime)
    }
  }

  function handleItemClick(category: string, subcategory?: string) {
    if (onItemClick) {
      onItemClick(category, subcategory || "")
    }
  }

  function isSelected(category: string, subcategory?: string): boolean {
    return selectedCategory === category && selectedSubcategory === (subcategory || "")
  }
</script>

<div class="flex flex-col gap-5">
  {#each Object.entries(budget) as [categoryName, category]}
    {@const categoryAvailable = getAvailableTime(categoryName)}
    {@const shouldShowCategory = !filterZeroTime || categoryAvailable > 0}

    {#if shouldShowCategory}
      <div class="block">
        <LabeledProgress
          spent={categoryOverages[categoryName] ?? 0}
          budget={category.time -
            Object.values(category.subcategories).reduce((sum, budget) => sum + budget, 0)}
          style="cursor-pointer {isSelected(categoryName)
            ? 'bg-blue-50 border-l-4 border-blue-500'
            : ''}"
          onclick={() => handleItemClick(categoryName)}
        >
          <h2 class="text-xl font-bold {isSelected(categoryName) ? 'text-blue-600' : ''}">
            {categoryName}
          </h2>
        </LabeledProgress>

        {#each Object.entries(category.subcategories) as [subcategoryName, subcategoryBudget]}
          {@const subcategoryAvailable = getAvailableTime(categoryName, subcategoryName)}
          {@const shouldShowSubcategory = !filterZeroTime || subcategoryAvailable > 0}

          {#if shouldShowSubcategory}
            <LabeledProgress
              spent={accumulatedTime[categoryName + subcategoryName] ?? 0}
              budget={subcategoryBudget}
              style="cursor-pointer {isSelected(categoryName, subcategoryName)
                ? 'bg-blue-50 border-l-4 border-blue-500'
                : ''}"
              onclick={() => handleItemClick(categoryName, subcategoryName)}
            >
              {#if currentTask?.category === categoryName && currentTask?.subcategory === subcategoryName}
                ▶️
              {/if}
              <span
                class={isSelected(categoryName, subcategoryName)
                  ? "font-semibold text-blue-600"
                  : ""}>{subcategoryName}</span
              >
            </LabeledProgress>
          {/if}
        {/each}
      </div>
    {/if}
  {/each}
</div>
