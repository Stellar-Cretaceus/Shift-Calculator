import type {
  Employee,
  Shift,
  ShiftCategory,
} from '@/lib/types'

import {
  scoreWorkload,
} from './workload'

import {
  scoreCategoryBalance,
  type NormalTimeOfDay,
} from './category-balance'

import {
  scoreDoubleShift,
} from './double-shift'


/**
 * Individual scoring weights.
 *
 * IMPORTANT:
 *
 * These are NOT hard rules.
 *
 * They only control preference between candidates
 * who are already legal according to canAssign().
 *
 *
 * Current priority:
 *
 * category balance >>> workload
 *
 * because the main business goal is to keep:
 *
 * Morning / Noon / Night
 *
 * reasonably balanced.
 */
export const DEFAULT_SCORE_WEIGHTS = {
  workload: 1,
  categoryBalance: 5,
  doubleShift: 2,
}


export type CandidateScoreWeights = {
  workload: number
  categoryBalance: number
  doubleShift: number
}


/**
 * Everything we need to score one candidate
 * for one proposed assignment.
 */
export type CandidateScoreContext = {
  /**
   * The complete working schedule currently known.
   *
   * Eventually this should include:
   *
   * - locked/manual shifts
   * - DB shifts
   * - generated shifts so far
   */
  shifts: Shift[]

  categories: ShiftCategory[]

  /**
   * Time bucket of the shift we're trying to assign.
   *
   * morning / noon / night
   */
  timeOfDay: NormalTimeOfDay

  /**
   * Date of the proposed assignment.
   *
   * Needed to determine whether this assignment
   * would create a double shift.
   */
  date: string

  /**
   * Optional custom weights.
   *
   * Useful later when tuning scheduler behavior.
   */
  weights?: CandidateScoreWeights
}


/**
 * Full score breakdown.
 *
 * Keeping the breakdown is VERY useful for debugging.
 *
 * Instead of only seeing:
 *
 * totalScore = 17
 *
 * we can see WHY:
 *
 * workload = 5
 * category = 2
 * double = 1
 */
export type CandidateScore = {
  employeeId: number

  totalScore: number

  workloadScore: number
  categoryBalanceScore: number
  doubleShiftScore: number

  /**
   * Whether the proposed assignment would turn
   * today into a double-shift day.
   */
  createsDoubleShift: boolean
}


/**
 * Count how many working shifts this employee
 * already has on the proposed date.
 *
 * Regular and Special both count as work.
 */
function countWorkingShiftsOnDate(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {
  return shifts.filter(shift => {
    if (
      shift.employeeId !== employeeId ||
      shift.date !== date
    ) {
      return false
    }

    const category =
      categories.find(
        category =>
          category.id === shift.categoryId,
      )

    if (!category) {
      return false
    }

    return (
      category.type === 'regular' ||
      category.type === 'special'
    )
  }).length
}


/**
 * Score ONE candidate.
 *
 *
 * Lower score = better candidate.
 *
 *
 * IMPORTANT:
 *
 * This function assumes canAssign() has ALREADY
 * confirmed that the assignment is legal.
 *
 * This function does NOT perform hard-rule checks.
 */
export function scoreCandidate(
  employee: Employee,
  context: CandidateScoreContext,
): CandidateScore {
  const weights =
    context.weights ??
    DEFAULT_SCORE_WEIGHTS


  // =========================================================
  // 1. Overall workload
  // =========================================================

  const workload =
    scoreWorkload(
      employee.id,
      context.shifts,
      context.categories,
    )


  // =========================================================
  // 2. Morning / Noon / Night balance
  // =========================================================

  const categoryBalance =
    scoreCategoryBalance(
      employee.id,
      context.timeOfDay,
      context.shifts,
      context.categories,
    )


  // =========================================================
  // 3. Double-shift fairness
  // =========================================================

  const shiftsToday =
    countWorkingShiftsOnDate(
      employee.id,
      context.date,
      context.shifts,
      context.categories,
    )


  /**
   * If the employee already has one shift today,
   * assigning another one creates a double shift.
   *
   * If they have no shift today, we don't need to
   * strongly care about their historical double-shift count.
   */
  const createsDoubleShift =
    shiftsToday >= 1


  const doubleShift =
    scoreDoubleShift(
      employee.id,
      context.shifts,
      context.categories,
    )


  /**
   * Only apply the double-shift penalty strongly
   * when THIS proposed assignment would create
   * a double-shift day.
   */
  const effectiveDoubleShiftScore =
    createsDoubleShift
      ? doubleShift.score
      : 0


  // =========================================================
  // 4. Weighted total
  // =========================================================

  const workloadScore =
    workload.score *
    weights.workload


  const categoryBalanceScore =
    categoryBalance.score *
    weights.categoryBalance


  const doubleShiftScore =
    effectiveDoubleShiftScore *
    weights.doubleShift


  const totalScore =
    workloadScore +
    categoryBalanceScore +
    doubleShiftScore


  return {
    employeeId:
      employee.id,

    totalScore,

    workloadScore,

    categoryBalanceScore,

    doubleShiftScore,

    createsDoubleShift,
  }
}

