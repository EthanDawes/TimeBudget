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

const bitmaskToArray = (mask) =>
  Array.from({ length: 7 }, (_, i) => i).filter((i) => mask & (1 << i))

let totalWeekBudgetedTime = 0 // For validation that you didn't go over

// Category `time` can't be `Spread`, only subcat
function Category(name, time, subcategories) {
  let totalTime = time.num
  for (const subcat of subcategories) {
    if (subcat.spread) {
      _Spread(name, subcat.name, ...subcat.spread)
    }
    delete subcat.spread
    if (time.type === "plus") totalTime += subcat.time
  }

  totalWeekBudgetedTime += totalTime
  return {
    name,
    time: totalTime,
    total: time.type === "total",
    subcategories,
  }
}

// TODO: what if I want to allocate a specific amount of time to 1 day? Find out through testing. Maybe values > 1 assumed to be raw, then take percentages from remaining?
// We can worry about implementing auto-free later, since I already have the ability to realloc w/i the app
function _Spread(cat, subcat, hours, rollover, distributions) {
  for (const spread of distributions) {
    const [daysBitmask, weight] = spread
    const days = bitmaskToArray(daysBitmask)
    for (const dayIdx of days) {
      schedule.push({
        day: dayIdx, // index to week
        duration: (hours * weight) / days.length,
        //calId: 0, // optional
        leftovers: rollover,
        cat,
        subcat,
      })
    }
  }
}

// When assigning a cal event, the difference is that PLUS will pull time from unalloc, TOTAL will not
const Plus = (hours) => ({ type: "plus", num: hours * HOUR })
const Total = (hours) => ({ type: "total", num: hours * HOUR })
const Spread = (hours, leftovers, ...distributions) => ({
  type: "total",
  num: hours * HOUR,
  spread: [hours * HOUR, leftovers, distributions],
})
const Subcat = (name, time) => ({
  name,
  time: time.num,
  total: time.type === "total",
  spread: time.spread,
})

// Useful estimates
const creditHours = 11
const workPerCredHour = 3
const courseworkTotal = creditHours * workPerCredHour

// `Subcat` need not contain every event, since inputting is tedious and is prone to change. It makes more sense to just pull from my gcal and assign categories to events.
// Things that I don't schedule on calendar but do nonetheless (see 'Wellness') use `Spread` to pre-budget time (convienence)

const schedule = []

const budget = [
  Category("Social", Total(15), [Subcat("Friends", Total(5)), Subcat("New Connections", Total(2))]),
  Category("Coursework", Total(courseworkTotal), [
    // Calculated from actual week data
    // 80% time spent before Thr, 20% time after
    Subcat("Hw", Spread(20, ROLLOVER, [M + T + W + R, 0.8], [F + S + J, 0.2])),
    Subcat("Hw Review", Total(1)),
    // It seems odd to have PLUS(0), but this'll be increased once cal events are assigned to the category in the UI
    Subcat("Lectures", Plus(0)),
  ]),
  Category("Jobs", Plus(0), [
    Subcat("Internships", Total(1 * DAILY)),
    Subcat("RHA", Plus(0)),
    Subcat(
      "RA",
      Plus(1 /* admin */ + 1 /* residents */ + 1 /* event planning */ /* All else on cal */),
    ),
  ]),
  Category("Wellness", Plus(0), [
    Subcat("Eat", Spread(6.5, FREE, [everyday, 1])),
    Subcat("Sleep", Spread(8 * DAILY, ROLLOVER, [everyday, 1])),
    Subcat("Excercise", Spread(0.5 * DAILY, FREE, [everyday, 1])),
    Subcat("Mindfullness", Total((10 / HOUR) * DAILY)),
    // Morning/evening routine accounted for in cal
    // `shower` is the only case where I might want the ability to create events that aren't in my cal, but later problem
    Subcat("Chores", Plus((20 / HOUR) * (DAILY / 2) /* Shower */ + 2 /* misc */)),
  ]),
  Category("Curiosity", Total(15), [
    Subcat("Learning", Total(5)),
    Subcat("Programming", Total(5)),
    Subcat("Projects", Total(5)),
  ]),
  Category("Relax", Total(5), [Subcat("Relax", Total(5))]),
]

console.log(`You have scheduled ${totalWeekBudgetedTime / HOUR}/168 hours each week`)

console.log(budget)
console.log(schedule)
