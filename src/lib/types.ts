export interface BudgetConfig {
  [category: string]: {
    // Total budgeted time for this category. Can be larger than the sum of subcategories to allow for wiggle room
    time: number
    subcategories: {
      [subcategory: string]: number
    }
  }
}

export interface CategoryProgress {
  category: string
  subcategory: string
  eventName: string
  budgeted: number // in minutes
  used: number // in minutes
  percentage: number
}
