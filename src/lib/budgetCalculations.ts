import type { Budget } from "./db"

export interface SubcategoryProgressItem {
  name: string
  categoryName: string
  budget: number
  spent: number
  scheduled?: number
  totalSpent: number
  overlayStart?: number
  overage: number
  categorySpilloverForThis: number
  remainingCategorySpillover: number
  remainingUnallocated: number
}

export interface CategoryProgressItem {
  name: string
  budget: number
  unallocatedSpillover: number
  totalCategorySpillover: number
  totalSubcategoryOverage: number
  poolAllocated: number
  remainingCategorySpillover: number
  subcategories: SubcategoryProgressItem[]
}

export interface UnallocatedProgressItem {
  budget: number
  spent: number
  scheduled?: number
  overlayStart?: number
  remaining: number
}

export interface ComputeCategoryProgressOptions {
  categories: Budget[]
  spentBySubcategory: Record<string, number>
  scheduledBySubcategory?: Record<string, number>
  unallocatedBudget: number
  unallocatedSpent: number
  unallocatedScheduled?: number
  // If subcategoryKeyFormat is 'concat', key is categoryName + subcategoryName (BudgetAllocator format).
  // If 'subcatOnly', key is subcategoryName (Tracker format).
  keyFormat?: "concat" | "subcatOnly"
  // Custom subcategory budget lookup (e.g. for Tracker where budget comes from today's schedule events)
  customSubcategoryBudgets?: Record<string, number>
  // Custom category budget lookup (e.g. for Tracker where category budget is derived from today's schedule events)
  customCategoryBudgets?: Record<string, number>
}

/**
 * Computes multi-bar / single-bar progress metrics for categories, subcategories, and unallocated time.
 */
export function computeCategoryProgress({
  categories,
  spentBySubcategory,
  scheduledBySubcategory = {},
  unallocatedBudget,
  unallocatedSpent,
  unallocatedScheduled = 0,
  keyFormat = "concat",
  customSubcategoryBudgets,
  customCategoryBudgets,
}: ComputeCategoryProgressOptions): {
  categories: CategoryProgressItem[]
  unallocated: UnallocatedProgressItem
} {
  const getKey = (catName: string, subName: string) =>
    keyFormat === "concat" ? catName + subName : subName

  const remainingUnallocated = Math.max(
    0,
    unallocatedBudget - (unallocatedSpent + unallocatedScheduled),
  )

  const computedCategories: CategoryProgressItem[] = categories.map((cat) => {
    const categoryName = cat.name
    const categoryBudget =
      customCategoryBudgets?.[categoryName] ??
      (customSubcategoryBudgets
        ? cat.subcategories.reduce(
            (sum, s) => sum + (customSubcategoryBudgets[getKey(categoryName, s.name)] ?? 0),
            0,
          )
        : cat.time)

    // Calculate subcategory budgets & overages
    const subcategoryData = cat.subcategories.map((s) => {
      const key = getKey(categoryName, s.name)
      const subBudget = customSubcategoryBudgets ? (customSubcategoryBudgets[key] ?? 0) : s.time
      const subSpent = spentBySubcategory[key] ?? 0
      const subScheduled = scheduledBySubcategory[key] ?? 0
      const totalSpent = subSpent + subScheduled
      const overage = Math.max(0, totalSpent - subBudget)
      const overlayStart = subScheduled > 0 ? subSpent : undefined

      return {
        name: s.name,
        categoryName,
        budget: subBudget,
        spent: subSpent,
        scheduled: subScheduled,
        totalSpent,
        overage,
        overlayStart,
      }
    })

    const subcategoriesBudgetSum = subcategoryData.reduce((sum, s) => sum + s.budget, 0)
    const totalCategorySpillover = Math.max(0, categoryBudget - subcategoriesBudgetSum)
    const totalSubcategoryOverage = subcategoryData.reduce((sum, s) => sum + s.overage, 0)
    const poolAllocated = Math.min(totalSubcategoryOverage, totalCategorySpillover)
    const remainingCategorySpillover = Math.max(
      0,
      totalCategorySpillover - totalSubcategoryOverage,
    )

    const subcategories: SubcategoryProgressItem[] = subcategoryData.map((s) => {
      const categorySpilloverForThis =
        totalSubcategoryOverage > 0 ? (s.overage / totalSubcategoryOverage) * poolAllocated : 0

      return {
        ...s,
        categorySpilloverForThis,
        remainingCategorySpillover,
        remainingUnallocated,
      }
    })

    return {
      name: categoryName,
      budget: categoryBudget,
      unallocatedSpillover: categoryBudget - subcategoriesBudgetSum,
      totalCategorySpillover,
      totalSubcategoryOverage,
      poolAllocated,
      remainingCategorySpillover,
      subcategories,
    }
  })

  const unallocated: UnallocatedProgressItem = {
    budget: unallocatedBudget,
    spent: unallocatedSpent + unallocatedScheduled,
    scheduled: unallocatedScheduled,
    overlayStart: unallocatedScheduled > 0 ? unallocatedSpent : undefined,
    remaining: remainingUnallocated,
  }

  return {
    categories: computedCategories,
    unallocated,
  }
}
