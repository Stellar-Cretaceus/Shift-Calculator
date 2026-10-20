
import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'


/**
 * Summary of one employee's workload.
 *
 * For now we only care about the number
 * of actual worked shifts.
 *
 * Later we can add more information here
 * if workload scoring becomes more detailed.
 */
export type EmployeeWorkload = {
  employeeId: number

  /**
   * Number of actual work assignments.
   *
   * Morning = 1
   * Noon = 1
   * Night = 1
   *
   * Morning + Noon on the same day = 2
   */
  shiftCount: number
}


/**
 * Result returned by workload scoring.
 *
 * Lower score = better candidate.
 *
 * That convention will be useful later when
 * candidate-score.ts combines several penalties.
 */
export type WorkloadScore = {
  score: number
  shiftCount: number
}


/**
 * Find the category belonging to one shift.
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
 * Decide whether a shift counts as actual work.
 *
 * Regular:
 * - Morning
 * - Noon
 * - Night
 *
 * Special:
 * - Seminar
 * - other manually-created work
 *
 * OFF and Vacation do NOT count as workload.
 */
function isWorkingShift(
  shift: Shift,
  categories: ShiftCategory[],
): boolean {
  const category =
    findCategory(
      shift.categoryId,
      categories,
    )

  if (!category) {
    return false
  }

  return (
    category.type === 'regular' ||
    category.type === 'special'
  )
}


/**
 * Count how many work shifts one employee has.
 *
 * IMPORTANT:
 *
 * We count assignments, not working days.
 *
 * Example:
 *
 * Monday:
 *   Morning
 *   Noon
 *
 * = workload 2
 *
 * This matches the fatigue rule as well.
 */
export function countEmployeeWorkload(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {
  return shifts.filter(shift => {
    if (shift.employeeId !== employeeId) {
      return false
    }

    return isWorkingShift(
      shift,
      categories,
    )
  }).length
}


/**
 * Build a workload summary for one employee.
 */
export function getEmployeeWorkload(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): EmployeeWorkload {
  return {
    employeeId,

    shiftCount:
      countEmployeeWorkload(
        employeeId,
        shifts,
        categories,
      ),
  }
}


/**
 * Convert workload into a score.
 *
 * LOWER SCORE = BETTER.
 *
 * For now:
 *
 * score = number of worked shifts
 *
 *
 * Example:
 *
 * Employee A:
 *   3 shifts
 *   score = 3
 *
 * Employee B:
 *   7 shifts
 *   score = 7
 *
 * Employee A is preferred.
 *
 *
 * Later candidate-score.ts will combine this
 * with other scores:
 *
 * workload
 * category balance
 * double-shift balance
 * seeded random tie-breaker
 */
export function scoreWorkload(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): WorkloadScore {
  const shiftCount =
    countEmployeeWorkload(
      employeeId,
      shifts,
      categories,
    )

  return {
    score: shiftCount,
    shiftCount,
  }
}

