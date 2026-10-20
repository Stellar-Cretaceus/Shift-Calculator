
import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'


export type NormalTimeOfDay =
  | 'morning'
  | 'noon'
  | 'night'


/**
 * Lower score = better candidate.
 */
export type CategoryBalanceScore = {
  score: number

  /**
   * Number of shifts this employee already has
   * in this Morning / Noon / Night bucket.
   */
  timeOfDayCount: number
}


/**
 * Find category information for one shift.
 */
function findCategory(
  categoryId: number,
  categories: ShiftCategory[],
): ShiftCategory | undefined {
  return categories.find(
    category =>
      category.id === categoryId,
  )
}


/**
 * Does this category represent actual work
 * that belongs to Morning / Noon / Night balancing?
 *
 * Counts:
 *
 * regular Morning/Noon/Night
 * special Morning/Noon/Night
 *
 * Does NOT count:
 *
 * OFF
 * Vacation
 * anything with timeOfDay = none
 */
function isBalanceableWorkingCategory(
  category: ShiftCategory | undefined,
): category is ShiftCategory {
  if (!category) {
    return false
  }

  const isWorking =
    category.type === 'regular' ||
    category.type === 'special'

  const hasNormalTimeOfDay =
    category.timeOfDay === 'morning' ||
    category.timeOfDay === 'noon' ||
    category.timeOfDay === 'night'

  return (
    isWorking &&
    hasNormalTimeOfDay
  )
}


/**
 * Count how many times an employee has worked
 * a particular time-of-day bucket.
 *
 *
 * Example:
 *
 * Morning:
 *
 * Regular Morning
 * Special Seminar (Morning)
 * Locked Morning
 *
 * All count toward the same Morning total.
 *
 *
 * IMPORTANT:
 *
 * This function does not care whether a shift was:
 *
 * - locked
 * - manually created
 * - generated
 *
 * If it exists in `shifts`, it counts.
 */
export function countEmployeeTimeOfDay(
  employeeId: number,
  timeOfDay: NormalTimeOfDay,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {
  return shifts.filter(shift => {
    if (
      shift.employeeId !== employeeId
    ) {
      return false
    }

    const category =
      findCategory(
        shift.categoryId,
        categories,
      )

    if (
      !isBalanceableWorkingCategory(
        category,
      )
    ) {
      return false
    }

    return (
      category.timeOfDay ===
      timeOfDay
    )
  }).length
}


/**
 * Score a candidate for the particular
 * Morning / Noon / Night slot we're filling.
 *
 *
 * LOWER SCORE = BETTER.
 *
 *
 * Example:
 *
 * Current target = Night
 *
 * Employee A:
 * Night = 1
 *
 * Employee B:
 * Night = 4
 *
 * A score = 1
 * B score = 4
 *
 * Prefer A.
 */
export function scoreCategoryBalance(
  employeeId: number,
  timeOfDay: NormalTimeOfDay,
  shifts: Shift[],
  categories: ShiftCategory[],
): CategoryBalanceScore {
  const timeOfDayCount =
    countEmployeeTimeOfDay(
      employeeId,
      timeOfDay,
      shifts,
      categories,
    )

  return {
    score: timeOfDayCount,
    timeOfDayCount,
  }
}


/**
 * Helpful summary for debugging later.
 */
export function getEmployeeTimeOfDayCounts(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): Record<NormalTimeOfDay, number> {
  return {
    morning:
      countEmployeeTimeOfDay(
        employeeId,
        'morning',
        shifts,
        categories,
      ),

    noon:
      countEmployeeTimeOfDay(
        employeeId,
        'noon',
        shifts,
        categories,
      ),

    night:
      countEmployeeTimeOfDay(
        employeeId,
        'night',
        shifts,
        categories,
      ),
  }
}

export const MAX_TIME_OF_DAY_SPREAD = 3


export function getEmployeeTimeOfDaySpread(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {

  const counts =
    getEmployeeTimeOfDayCounts(
      employeeId,
      shifts,
      categories,
    )


  const values = [
    counts.morning,
    counts.noon,
    counts.night,
  ]


  return (
    Math.max(...values) -
    Math.min(...values)
  )
}


/**
 * Protect category balance during later optimizers.
 *
 * If the employee is already outside the preferred range,
 * we still allow moves that improve or preserve it.
 *
 * We only reject a move when it makes an already-too-large
 * spread even worse, or crosses the limit.
 */
export function worsensTimeOfDayBalanceBeyondLimit(
  employeeId: number,
  beforeShifts: Shift[],
  afterShifts: Shift[],
  categories: ShiftCategory[],
): boolean {

  const beforeSpread =
    getEmployeeTimeOfDaySpread(
      employeeId,
      beforeShifts,
      categories,
    )


  const afterSpread =
    getEmployeeTimeOfDaySpread(
      employeeId,
      afterShifts,
      categories,
    )


  return (
    afterSpread >
      MAX_TIME_OF_DAY_SPREAD &&
    afterSpread >
      beforeSpread
  )
}
