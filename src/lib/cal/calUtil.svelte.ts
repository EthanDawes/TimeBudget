import { loadBudgetConfig } from "$lib/budgetManager"
import type { Budget } from "$lib/db"

// This is OK because svelte components re-render for functions that have dependant state
let budgetConfig = $state<Budget[]>([])

budgetConfig = await loadBudgetConfig()

// Color palette matching budget-generator.js
const palette = [
  "#3366cc",
  "#dc3912",
  "#ff9900",
  "#109618",
  "#990099",
  "#0099c6",
  "#dd4477",
  "#66aa00",
  "#b82e2e",
  "#316395",
]

// Get category colors
const getCategoryColor = (category: string) => {
  const index = budgetConfig.findIndex((c) => c.name === category)
  return palette[index % palette.length] || "#999999"
}

// Generate shades for subcategories
export const getSubcategoryColor = (category: string, subcategory: string) => {
  const baseColor = getCategoryColor(category)
  const cat = budgetConfig.find((c) => c.name === category)
  const subcategories = cat?.subcategories.map((s) => s.name) || []
  const index = subcategories.indexOf(subcategory)
  const totalSubs = subcategories.length

  // Create lighter/darker shades
  const shade = 0.3 + (index / Math.max(totalSubs - 1, 1)) * 0.4 // 0.3 to 0.7 range
  return adjustColorBrightness(baseColor, shade)
}

// Helper to adjust color brightness
const adjustColorBrightness = (hex: string, factor: number) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const newR = Math.round(r + (255 - r) * (1 - factor))
  const newG = Math.round(g + (255 - g) * (1 - factor))
  const newB = Math.round(b + (255 - b) * (1 - factor))

  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`
}
