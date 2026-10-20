import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'

import type {
  NormalTimeOfDay,
} from './daily-combination'


/**
 * Four consecutive Night days are allowed.
 *
 * The fifth consecutive Night day is forbidden.
 */
export const MAX_CONSECUTIVE_NIGHT_DAYS = 3


function addDays(
  date: string,
  amount: number,
): string {

  const value =
    new Date(`${date}T00:00:00`)

  value.setDate(
    value.getDate() + amount,
  )


  const year =
    value.getFullYear()

  const month =
    String(
      value.getMonth() + 1,
    ).padStart(2, '0')

  const day =
    String(
      value.getDate(),
    ).padStart(2, '0')


  return `${year}-${month}-${day}`
}


/**
 * Does this employee have ANY Night work on this date?
 *
 * We care about Night DAYS, not number of shifts.
 *
 * Example:
 *
 * Morning + Night
 *
 * still counts as:
 *
 * one Night day
 */
function hasNightOnDate(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): boolean {

  return shifts.some(shift => {

    if (
      shift.employeeId !== employeeId ||
      shift.date !== date
    ) {
      return false
    }


    const category =
      categories.find(
        category =>
          category.id ===
          shift.categoryId,
      )


    if (!category) {
      return false
    }


    /**
     * Count normal Night work.
     *
     * Also count a Special shift if it is explicitly
     * classified as Night.
     */
    const isWorkingCategory =
      category.type === 'regular' ||
      category.type === 'special'


    return (
      isWorkingCategory &&
      category.timeOfDay === 'night'
    )
  })
}


/**
 * Check a PROPOSED assignment.
 *
 * This scans both backward and forward because repair /
 * optimization may insert a Night in the middle of an
 * already-built schedule.
 */
export function checkNightStreakRule(
  employeeId: number,
  proposedDate: string,
  proposedTimeOfDay:
    NormalTimeOfDay,
  shifts: Shift[],
  categories: ShiftCategory[],
): {
  allowed: boolean
  consecutiveNightDays: number
} {

  /**
   * Morning / Noon cannot create a new Night streak.
   */
  if (
    proposedTimeOfDay !== 'night'
  ) {
    return {
      allowed: true,
      consecutiveNightDays: 0,
    }
  }


  let consecutiveNightDays = 1


  // =========================================================
  // Scan backward
  // =========================================================

  let previousDate =
    addDays(
      proposedDate,
      -1,
    )


  while (
    hasNightOnDate(
      employeeId,
      previousDate,
      shifts,
      categories,
    )
  ) {

    consecutiveNightDays++

    previousDate =
      addDays(
        previousDate,
        -1,
      )
  }


  // =========================================================
  // Scan forward
  // =========================================================

  let nextDate =
    addDays(
      proposedDate,
      1,
    )


  while (
    hasNightOnDate(
      employeeId,
      nextDate,
      shifts,
      categories,
    )
  ) {

    consecutiveNightDays++

    nextDate =
      addDays(
        nextDate,
        1,
      )
  }


  return {
    allowed:
      consecutiveNightDays <=
      MAX_CONSECUTIVE_NIGHT_DAYS,

    consecutiveNightDays,
  }
}


/**
 * Validate an ALREADY-BUILT schedule.
 *
 * Useful for:
 *
 * - frontend validation
 * - optimizer safety
 * - manual shifts
 */
export function hasNightStreakViolationAroundDate(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): boolean {

  /**
   * If this date is not a Night day,
   * there cannot be a Night streak centered here.
   */
  if (
    !hasNightOnDate(
      employeeId,
      date,
      shifts,
      categories,
    )
  ) {
    return false
  }


  let consecutiveNightDays = 1


  let previousDate =
    addDays(
      date,
      -1,
    )


  while (
    hasNightOnDate(
      employeeId,
      previousDate,
      shifts,
      categories,
    )
  ) {

    consecutiveNightDays++

    if (
      consecutiveNightDays >
      MAX_CONSECUTIVE_NIGHT_DAYS
    ) {
      return true
    }


    previousDate =
      addDays(
        previousDate,
        -1,
      )
  }


  let nextDate =
    addDays(
      date,
      1,
    )


  while (
    hasNightOnDate(
      employeeId,
      nextDate,
      shifts,
      categories,
    )
  ) {

    consecutiveNightDays++

    if (
      consecutiveNightDays >
      MAX_CONSECUTIVE_NIGHT_DAYS
    ) {
      return true
    }


    nextDate =
      addDays(
        nextDate,
        1,
      )
  }


  return false
}