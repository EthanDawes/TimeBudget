const MINUTE = 1
const SECOND = MINUTE / 60
const MILLISECOND = SECOND / 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const DAILY = 7

// Days of the week
const M = 1
const T = 2
const W = 4
const R = 8
const F = 16 // Muslim day of worship Jum'ah
const S = 32 // Sabbath
const J = 64 // Jesusday
const weekdays = M + T + W + R + F
const everyday = weekdays + S + J

// Unspent behavior
// If unspent that day, will persist and need to be budgeted some other day. Default
const ROLLOVER = -1
// If unspent that day, will be discarded and added to the "unallocated" pool
const FREE = -2

// This is a validator function with no current UI features. It provides insight into whether your schedule for every day is possible and how difficult it will be.
// For example, if you have a 4 hour confrence one day, and 20 hours of homework, it should
// Resolving how to spread time is a task best left to the user (eg. moving 2 hr of homework to the next day)
// Maybe make M..J objects with a .add and .sub method to move time around?
/*function Spread(time, ...dates) {
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
const TOTAL = (hours) => ({ type: "total", num: hours })*/

const creditHours = 15
const workPerCredHour = 3 * HOUR
const lectureDuration = Spread(2 * HOUR, T, R) + Spread(1.5 * HOUR * 6, T, R) // 2 PSOs (hour-long) + 6 power hours. I think attending STAT 511 & linalg less likely
const courseworkTotal = creditHours * workPerCredHour

const mealsPerDay = 2
const mealDuration = 30 * MINUTE

// Dates available
// Daily minimums
// Roll over or free

const budget2 = [
  Category("Social", TOTAL(15), [
    Subcat("Friends", TOTAL(5), [
      Event("Hack Night", 3 * HOUR, F, FREE), //
    ]),
    Subcat("New Connections", TOTAL(2)),
  ]),
  Category("Coursework", TOTAL(35), [
    Subcat("Hw", TOTAL(20), [
      // Calculated from actual week data
      // TODO: should I make this heavier before R? Can experiment once UI exists
      Event(null, 20 * HOUR, everyday),
    ]),
    Subcat("Hw Review", TOTAL(1)), // Doesn't make sense to split over weekdays (too short per day, do ~2/wk)
    Subcat("Lectures", PLUS(0), [
      Event("Real Analysis", 2.5 * HOUR, T + R),
      Event("CS 381", 2.5 * HOUR, T + R),
      Event("CS 381", 50 * MINUTE, W),
      Event("CS 422", 2.5 * HOUR, T + R),
      Event("Learning & Motivation", 50 * MINUTE * 2, M + W),
    ]),
  ]),
  Category("Jobs", PLUS(0), [
    Subcat("RA", PLUS(0), [
      //Event("Hall Club", )
      // TODO: This is very tedious and is prone to change. It makes more sense to just pull from my gcal and assign categories to events.
    ]),
  ]),
]

const budget = {
  ...Category("Social", TOTAL(15 * HOUR), {
    Friends: {
      time: 2 * HOUR, // Always assume plus
      events: [
        {
          name: "Hack night",
          time: 3 * HOUR,
          days: [F],
          unspent: FREE, // ROLLOVER, FREE
        },
      ],
    },
    "New connections": {
      time: 2 * HOUR,
      events: [],
    },
  }),
  ...Category("Coursework", TOTAL(35 * HOUR), {
    Hw: {
      time: 0,
      events: [
        {
          //name: "work",
          time: 20 * HOUR, // Calculated from actual week data
          days: everyday,
          unspent: ROLLOVER,
        },
      ],
    },
    //Spread(20 * HOUR, ...everyday),
    "Hw review": {
      time: 1 * HOUR,
      events: [],
    },
    Lectures: {
      time: lectureDuration,
      events: [],
    },
    "Office hours / group study": Spread(1 * HOUR, ...weekdays),
  }),
  ...Category("Jobs", PLUS(0), {
    ECELabs: Spread(1 * HOUR, T) + Spread(2 * HOUR, W) + 7 * HOUR, // Team lead, SW & general meeting
    Internships: Spread(1 * HOUR * DAILY, M, R, S),
    RHA: Spread(1 * HOUR, M) + Spread(1 * HOUR, W) + Spread(45 * MINUTE, W) + 1.25 * HOUR, // Senate, 1:1, Exec, resp. sometimes PRT. 4hr total
    RA: 6.5 * HOUR,
  }),
  /*...Category("RA", PLUS(0), {
    // 1 hr rounds, 1 hr newsletter, 1 hr shopping, 2 hr event execution
    "Hall Club": Spread(1 * HOUR, M),
    Staff: Spread(1 * HOUR, M),
    "1:1": Spread(30 * MINUTE, T), // Can be either M or T
    Admin: 1 * HOUR, // Newsletter, program proposal/reflection
    Residents: 1 * HOUR, // Interact, answer questions
    Event: 2 * HOUR, // Include planning
    Duty: Spread(1 * HOUR, J),
  }),*/
  ...Category("Wellness", PLUS(0), {
    Eat: Spread(6.5 * HOUR, ...everyday), // My fancy formula turned out to be too much time
    // TODO: this would be a good use case for more intelligent per-day budgeting. If I don't spend 30 min eating, I can assume I saved that time and add to unalloc time
    Sleep: Spread(8 * HOUR * DAILY, ...everyday),
    Exercise: 30 * MINUTE * DAILY,
    Mindfullness: 10 * MINUTE * DAILY,
    // Chores includes Routine, Clean, Shower, and Schedule (future planning)
    // Morning, evening, and shower. Plus time for cleaning/organization
    Chores: Spread(10 * MINUTE * DAILY + 20 * MINUTE * DAILY * 3, ...everyday),
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
