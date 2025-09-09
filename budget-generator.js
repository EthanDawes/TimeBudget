const MINUTE = 1
const SECOND = MINUTE / 60
const MILLISECOND = SECOND / 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const DAILY = 7

function Category(name, time, subcategories) {
  const subcatTotal = Object.values(subcategories).reduce((acc, val) => acc + val)
  if (time.type === "total" && subcatTotal > time.num)
    throw `Total time cannot be less than combined subcategory time (${subcatTotal} exceeds ${time.num})`
  return {
    [name]: {
      time: time.type === "total" ? time.num : subcatTotal + time.num,
      subcategories,
    },
  }
}

const PLUS = (num) => ({ type: "plus", num })
const TOTAL = (num) => ({ type: "total", num })

const creditHours = 15
const workPerCredHour = 3 * HOUR
const lectureDuration = 8 * HOUR + 1.5 * HOUR * 6 // 8 regular lectures (hour-long) + 6 power hours
const courseworkTotal = creditHours * workPerCredHour

const mealsPerDay = 2
const mealDuration = 30 * MINUTE

const budget = {
  ...Category("Social", TOTAL(15 * HOUR), {
    El: 2 * HOUR,
    Friends: 2 * HOUR,
    "New connections": 2 * HOUR,
    "Hack night": 3 * HOUR,
  }),
  ...Category("Coursework", PLUS(0), {
    Hw: courseworkTotal - 7 * HOUR - lectureDuration,
    "Hw review": 2 * HOUR,
    Lectures: 0,
    "Office hours / group study": 5 * HOUR,
  }),
  ...Category("Jobs", PLUS(0), {
    ECELabs: 10 * HOUR,
    "Apply for internships": 1 * HOUR * DAILY,
    RA: 5 * HOUR, // 1 hr rounds, 1 hr newsletter, 1 hr shopping, 2 hr event execution
    RHA: 4 * HOUR, // Senate, PRT, 1:1, Exec
  }),
  ...Category("Wellness", PLUS(0), {
    Eat: mealDuration * mealsPerDay * DAILY + 10 * MINUTE * DAILY, // Lunch/dinner take longer, breakfast is quick
    // TODO: this would be a good use case for more intelligent per-day budgeting. If I don't spend 30 min eating, I can assume I saved that time and add to unalloc time
    Sleep: 8 * HOUR * DAILY,
    Exercise: 30 * MINUTE * DAILY,
    Mindfullness: 10 * MINUTE * DAILY,
    Chores: 10 * MINUTE * DAILY + 20 * MINUTE * DAILY * 3, // Morning, evening, and shower. Plus time for cleaning/organization
  }),
  ...Category("Curiosity", TOTAL(15 * HOUR), {
    Learning: 5 * HOUR,
    "Side programming": 10 * HOUR,
  }),
}

console.log(budget)
console.log(JSON.stringify(budget))

// Validate budget
const minutesPerWeek = 7 * DAY
const budgetedTotal = Object.values(budget).reduce((acc, cat) => acc + cat.time, 0)
console.log("you have", (minutesPerWeek - budgetedTotal) / HOUR, "unallocated hours")

// AI below
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

function generatePieChartConfig(budgetConfig) {
  const labels = []
  const data = []
  const backgroundColor = []

  let paletteIndex = 0

  Object.entries(budgetConfig).forEach(([category, { time, subcategories }]) => {
    const categoryColor = palette[paletteIndex % palette.length]
    const subTotal = Object.values(subcategories).reduce((a, b) => a + b, 0)

    Object.entries(subcategories).forEach(([sub, val]) => {
      labels.push(sub)
      data.push(val / HOUR)
      backgroundColor.push(categoryColor)
    })

    if (subTotal < time) {
      labels.push(`${category} other`)
      data.push((time - subTotal) / HOUR)
      backgroundColor.push(categoryColor)
    }

    paletteIndex++
  })

  return {
    type: "pie",
    data: { labels, datasets: [{ data, backgroundColor }] },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "right" },
      },
    },
  }
}

const chartConfig = generatePieChartConfig(budget)
console.log(chartConfig)
