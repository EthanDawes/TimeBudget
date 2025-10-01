const MINUTE = 1
const SECOND = MINUTE / 60
const MILLISECOND = SECOND / 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const DAILY = 7

// Days of the week
const M = 0
const T = 1
const W = 2
const R = 3
const F = 4 // Muslim day of worship Jum'ah
const S = 5 // Sabbath
const J = 6 // Jesusday
const weekdays = [M, T, W, R, F]
const everyday = [...weekdays, S, J]

// This is a validator function with no current UI features. It provides insight into whether your schedule for every day is possible and how difficult it will be.
// For example, if you have a 4 hour confrence one day, and 20 hours of homework, it should
// Resolving how to spread time is a task best left to the user (eg. moving 2 hr of homework to the next day)
// Maybe make M..J objects with a .add and .sub method to move time around?
function Spread(time, ...dates) {
  const dailyTime = time / dates.length
  for (const date of dates) {
    dailyPlannedTime[date] -= dailyTime
  }
  return time
}
// Used by `Spread` Currently maps date (index) to free time that day. TODO: make this a pie chart per day?
const dailyPlannedTime = Array(7).fill(DAY)

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

const PLUS = (hours) => ({ type: "plus", num: hours })
const TOTAL = (hours) => ({ type: "total", num: hours })

const creditHours = 15
const workPerCredHour = 3 * HOUR
const lectureDuration = Spread(2 * HOUR, T, R) + Spread(1.5 * HOUR * 6, T, R) // 2 PSOs (hour-long) + 6 power hours. I think attending STAT 511 & linalg less likely
const courseworkTotal = creditHours * workPerCredHour

const mealsPerDay = 2
const mealDuration = 30 * MINUTE

const budget = {
  ...Category("Social", TOTAL(15 * HOUR), {
    Friends: 2 * HOUR,
    "New connections": 2 * HOUR,
    "Big Hill": Spread(2 * HOUR, T, R),
    "Hack night": Spread(3 * HOUR, F),
  }),
  ...Category("Coursework", TOTAL(35 * HOUR), {
    Hw: Spread(20 * HOUR, ...everyday), // Calculated from actual week data
    "Hw review": Spread(1 * HOUR, ...weekdays),
    Lectures: lectureDuration,
    "Office hours / group study": Spread(1 * HOUR, ...weekdays),
  }),
  ...Category("Jobs", PLUS(0), {
    ECELabs: Spread(1 * HOUR, T) + Spread(2 * HOUR, W) + 7 * HOUR, // Team lead, SW & general meeting
    Internships: Spread(1 * HOUR * DAILY, M, R, S),
    RHA: Spread(1 * HOUR, M) + Spread(1 * HOUR, W) + Spread(45 * MINUTE, W) + 1.25 * HOUR, // Senate, 1:1, Exec, resp. sometimes PRT. 4hr total
  }),
  ...Category("RA", PLUS(0), {
    // 1 hr rounds, 1 hr newsletter, 1 hr shopping, 2 hr event execution
    "Hall Club": Spread(1 * HOUR, M),
    Staff: Spread(1 * HOUR, M),
    "1:1": Spread(30 * MINUTE, T), // Can be either M or T
    Admin: 1 * HOUR, // Newsletter, program proposal/reflection
    Residents: 1 * HOUR, // Interact, answer questions
    Event: 2 * HOUR, // Include planning
    Duty: Spread(1 * HOUR, J),
  }),
  ...Category("Wellness", PLUS(0), {
    Eat: Spread(6.5 * HOUR, ...everyday), // My fancy formula turned out to be too much time
    // TODO: this would be a good use case for more intelligent per-day budgeting. If I don't spend 30 min eating, I can assume I saved that time and add to unalloc time
    Sleep: Spread(8 * HOUR * DAILY, ...everyday),
    Exercise: 30 * MINUTE * DAILY,
    Mindfullness: 10 * MINUTE * DAILY,
  }),
  ...Category("Chores", TOTAL(Spread(10 * MINUTE * DAILY + 20 * MINUTE * DAILY * 3, ...everyday)), {
    // Morning, evening, and shower. Plus time for cleaning/organization
    Routine: 0,
    Clean: 0,
    Shower: 0,
    Schedule: 0, // Includes future planning
  }),
  ...Category("Curiosity", TOTAL(15 * HOUR), {
    Learning: 5 * HOUR,
    Programming: 5 * HOUR,
    Projects: 5 * HOUR,
  }),
  ...Category("Relax", PLUS(0), {
    Relax: 0, // Idk, I definately need time for this but don't know where to take it from
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

// Time per day of week (copied from `time.ts`, not very DRY)
function fmtDuration(minutes) {
  minutes = Math.round(minutes) // Round now instead of later to avoid weird "4h 60m"
  const sign = minutes < 0 ? "-" : ""
  const abs = Math.abs(minutes)
  const hours = Math.floor(abs / HOUR)
  const remaining = abs % HOUR
  return [sign, hours ? `${hours}h ` : "", remaining || !hours ? `${remaining}m` : ""].join("")
}
console.log(dailyPlannedTime.map(fmtDuration))
