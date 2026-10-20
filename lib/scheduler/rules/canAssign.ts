
import type {
  Employee,
  EmployeeTitle,
  Shift,
  ShiftCategory,
} from '@/lib/types'

import type {
  ShiftBlockState,
} from '../types'

import {
  canEmployeeWorkRole,
  canTitleWorkCategory,
  canTitleWorkLocation,
} from './permissions'

import {
  findTitle,
} from './compatibility'

import {
  hasOpenRoleSlot,
  isEmployeeAlreadyAssigned,
} from '../generation/blockState'

import {
  canStillCompletePairs,
  type PairCandidate,
  type PairRoleConfig,
} from '../validation/canStillCompletePairs'

import {
  isTitleAvailableOnDate,
} from './availability'

import {
  isBlockedByLockedShift,
  type NormalTimeOfDay,
} from './locked'

import {
  checkDailyCombination,
} from './daily-combination'

import {
  checkShiftSequence,
} from './sequence'

import {
  checkFatigueRule,
} from './fatigue'

import {
  checkConsecutiveDouble,
} from './consecutive-double'

import {
  checkNightStreakRule,
} from './night-streak'

/**
 * Every hard-rule reason that can reject an assignment.
 *
 * This list will keep growing as we add more rule modules.
 */
export type AssignmentRejectionReason =
  | 'EMPLOYEE_HAS_NO_TITLE'
  | 'ROLE_NOT_ALLOWED'
  | 'CATEGORY_NOT_ALLOWED'
  | 'LOCATION_NOT_ALLOWED'
  | 'NOT_AVAILABLE'
  | 'BLOCKED_BY_LOCKED_SHIFT'
  | 'DAILY_COMBINATION_VIOLATION'
  | 'SHIFT_SEQUENCE_VIOLATION'
  | 'CONSECUTIVE_NIGHT_LIMIT'
  | 'CONSECUTIVE_DOUBLE_SHIFT'
  | 'FATIGUE_REST_REQUIRED'
  | 'ROLE_SLOT_FULL'
  | 'ALREADY_ASSIGNED_TO_BLOCK'
  | 'PAIRING_DEAD_END'

/**
 * Represents ONE open shift slot that the scheduler
 * is currently trying to fill.
 */
export type AssignmentRequirement = {
  locationId: number
  roleId: number
  categoryId: number
  date: string
}


export type AssignmentRuleContext = {
  /**
   * All employee Titles / Ranks.
   */
  titles: EmployeeTitle[]

  /**
   * Current state of the shift block.
   */
  block: ShiftBlockState

  /**
   * Employees who could potentially fill
   * remaining slots in this block.
   */
  candidates: PairCandidate[]

  /**
   * Defines which roles form a pair.
   *
   * Example:
   *
   * In Charge + Member
   */
  pairRoles: PairRoleConfig

  /**
   * Holiday dates such as:
   *
   * Set([
   *   '2026-09-28',
   *   '2026-10-13',
   * ])
   */
  holidayDates: Set<string>

  /**
   * Existing/manual/locked shifts.
   *
   * These will later come from the DB pipeline.
   */
  existingShifts: Shift[]


  /**
   * Strictly immutable shifts.
   *
   * Used by fatigue lookahead.
   */
  lockedShifts: Shift[]


  /**
   * Needed to understand whether an existing shift
   * is Vacation, Special, Morning, etc.
   */
  categories: ShiftCategory[]
}


/**
 * Result returned by canAssign().
 */
export type AssignmentCheck = {
  allowed: boolean
  reasons: AssignmentRejectionReason[]
}


/**
 * Find the target shift category.
 *
 * Example:
 *
 * categoryId = 1
 *     ↓
 * Morning
 */
function findCategory(
  categoryId: number,
  categories: ShiftCategory[],
): ShiftCategory | undefined {
  return categories.find(
    category => category.id === categoryId,
  )
}

/**
 * Get the employee's REGULAR Morning / Noon / Night shifts
 * on one particular date.
 *
 * Used for daily-combination rules.
 */
function getEmployeeNormalTimeOfDays(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): NormalTimeOfDay[] {
  return shifts
    .filter(
      shift =>
        shift.employeeId === employeeId &&
        shift.date === date,
    )
    .map(
      shift =>
        findCategory(
          shift.categoryId,
          categories,
        ),
    )
    .filter(
      (
        category,
      ): category is ShiftCategory =>
        category !== undefined &&
        (
          category.type === 'regular' ||
          category.type === 'special'
        ),
    )
    .map(category => {
      // Old Special rows with no classification
      // count as Morning for V1.
      if (
        category.type === 'special' &&
        category.timeOfDay === 'none'
      ) {
        return 'morning' as NormalTimeOfDay
      }

      return category.timeOfDay as NormalTimeOfDay
    })
    .filter(
      timeOfDay =>
        timeOfDay === 'morning' ||
        timeOfDay === 'noon' ||
        timeOfDay === 'night',
    )
}


/**
 * Similar to getEmployeeNormalTimeOfDays(),
 * but includes Special shifts that occupy a time slot.
 *
 * Example:
 *
 * Seminar:
 *   type = special
 *   timeOfDay = morning
 *
 * This matters for:
 *
 * Night today -> Seminar tomorrow morning ❌
 */
function getEmployeeSequenceTimeOfDays(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): NormalTimeOfDay[] {
  return shifts
    .filter(shift =>
      shift.employeeId === employeeId &&
      shift.date === date
    )
    .map(shift =>
      findCategory(
        shift.categoryId,
        categories,
      ),
    )
    .filter(
      (
        category,
      ): category is ShiftCategory =>
        category !== undefined &&
        (
          category.type === 'regular' ||
          category.type === 'special'
        ),
    )
    .map(category => {
      if (
        category.type === 'special' &&
        category.timeOfDay === 'none'
      ) {
        return 'morning' as NormalTimeOfDay
      }

      return category.timeOfDay as NormalTimeOfDay
    })
    .filter(
      timeOfDay =>
        timeOfDay === 'morning' ||
        timeOfDay === 'noon' ||
        timeOfDay === 'night',
    )
}


/**
 * Add/subtract days without using UTC conversion.
 *
 * Example:
 *
 * addDays('2026-09-28', -1)
 * -> '2026-09-27'
 */
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
 * Central HARD-RULE checker.
 *
 * This function DOES NOT assign anybody.
 *
 * It only answers:
 *
 *   "Is this proposed assignment legal?"
 */
export function canAssign(
  employee: Employee,
  requirement: AssignmentRequirement,
  context: AssignmentRuleContext,
): AssignmentCheck {
  const reasons: AssignmentRejectionReason[] = []


  // =========================================================
  // STEP 1 — Find employee Title / Rank
  // =========================================================

  const title = findTitle(
    context.titles,
    employee.titleId,
  )

  if (!title) {
    reasons.push('EMPLOYEE_HAS_NO_TITLE')

    /**
     * Most later checks require a title,
     * so there is no point continuing.
     */
    return {
      allowed: false,
      reasons,
    }
  }


  // =========================================================
  // STEP 2 — Individual hard rules
  // =========================================================


  // ---------------------------------------------------------
  // Role permission
  // ---------------------------------------------------------

  if (
    !canEmployeeWorkRole(
      employee,
      requirement.roleId,
    )
  ) {
    reasons.push('ROLE_NOT_ALLOWED')
  }


  // ---------------------------------------------------------
  // Category permission
  // ---------------------------------------------------------

  if (
    !canTitleWorkCategory(
      title,
      requirement.categoryId,
    )
  ) {
    reasons.push('CATEGORY_NOT_ALLOWED')
  }


  // ---------------------------------------------------------
  // Location permission
  //
  // Currently architected but effectively disabled.
  // ---------------------------------------------------------

  if (
    !canTitleWorkLocation(
      title,
      requirement.locationId,
    )
  ) {
    reasons.push('LOCATION_NOT_ALLOWED')
  }


  // ---------------------------------------------------------
  // Availability / working-pattern rule
  // ---------------------------------------------------------

  const isHoliday =
    context.holidayDates.has(
      requirement.date,
    )

  if (
    !isTitleAvailableOnDate(
      title,
      requirement.date,
      isHoliday,
    )
  ) {
    reasons.push('NOT_AVAILABLE')
  }


  // =========================================================
  // STEP 3 — Existing locked/manual shift rules
  // =========================================================

  /**
   * We need to know whether the target requirement
   * is Morning / Noon / Night.
   *
   * Special/Vacation are excluded from automatic generation,
   * so canAssign() should normally only receive regular
   * categories here.
   */
  const targetCategory = findCategory(
    requirement.categoryId,
    context.categories,
  )

  /**
   * Only Morning / Noon / Night can participate
   * in this particular locked-slot check.
   *
   * If category data is malformed or timeOfDay = none,
   * we simply skip this specific check.
   *
   * Other validation can catch malformed categories later.
   */
  if (
    targetCategory &&
    targetCategory.timeOfDay !== 'none'
  ) {
    const timeOfDay =
      targetCategory.timeOfDay as NormalTimeOfDay

    if (
      isBlockedByLockedShift(
        employee.id,
        requirement.date,
        timeOfDay,
        context.existingShifts,
        context.categories,
      )
    ) {
      reasons.push(
        'BLOCKED_BY_LOCKED_SHIFT',
      )
    }
  }

  // =========================================================
// STEP 4 — Same-day and cross-day shift rules
// =========================================================

if (
  targetCategory &&
  targetCategory.timeOfDay !== 'none'
) {
  const proposedTimeOfDay =
    targetCategory.timeOfDay as NormalTimeOfDay


  // -------------------------------------------------------
  // Same-day combination
  //
  // Examples:
  //
  // Morning + Noon ✅
  // Morning + Night ✅
  // Noon + Night ❌
  // Morning + Morning ❌
  // More than 2 normal shifts ❌
  // -------------------------------------------------------

  const todayTimeOfDays =
    getEmployeeNormalTimeOfDays(
      employee.id,
      requirement.date,
      context.existingShifts,
      context.categories,
    )

  const dailyCheck =
    checkDailyCombination(
      todayTimeOfDays,
      proposedTimeOfDay,
    )

  if (!dailyCheck.allowed) {
    reasons.push(
      'DAILY_COMBINATION_VIOLATION',
    )
  }


  // -------------------------------------------------------
  // Previous / next day sequence
  //
  // Night -> Morning ❌
  //
  // Checked in both directions because tomorrow/yesterday
  // may already contain a manual or locked shift.
  // -------------------------------------------------------

  const previousDate =
    addDays(
      requirement.date,
      -1,
    )

  const nextDate =
    addDays(
      requirement.date,
      1,
    )

  const previousDayTimeOfDays =
    getEmployeeSequenceTimeOfDays(
      employee.id,
      previousDate,
      context.existingShifts,
      context.categories,
    )

  const nextDayTimeOfDays =
    getEmployeeSequenceTimeOfDays(
      employee.id,
      nextDate,
      context.existingShifts,
      context.categories,
    )

  const sequenceCheck =
    checkShiftSequence(
      previousDayTimeOfDays,
      proposedTimeOfDay,
      nextDayTimeOfDays,
    )


  if (!sequenceCheck.allowed) {
    reasons.push(
      'SHIFT_SEQUENCE_VIOLATION',
    )
  }

  // -------------------------------------------------------
  // Maximum consecutive Night days
  //
  // Night x3 ✅
  // Night x4 ❌
  // -------------------------------------------------------

  const nightStreakCheck =
    checkNightStreakRule(
      employee.id,
      requirement.date,
      proposedTimeOfDay,
      context.existingShifts,
      context.categories,
    )


  if (
    !nightStreakCheck.allowed
  ) {
    reasons.push(
      'CONSECUTIVE_NIGHT_LIMIT',
    )
  }

  // -------------------------------------------------------
  // Consecutive double-shift rule
  //
  // A double-shift day may NOT sit directly next to
  // another double-shift day.
  //
  // Example:
  //
  // Day 10:
  // Morning + Noon
  //
  // Day 11:
  // Morning + Noon
  //
  // ❌ forbidden
  // -------------------------------------------------------

  const consecutiveDoubleCheck =
    checkConsecutiveDouble(
      employee.id,
      requirement.date,
      previousDate,
      nextDate,
      context.existingShifts,
      context.categories,
    )


  if (
    !consecutiveDoubleCheck.allowed
  ) {
    reasons.push(
      'CONSECUTIVE_DOUBLE_SHIFT',
    )
  }
}

// =========================================================
// STEP 5 — Required-rest / fatigue rule
// =========================================================

const fatigueCheck =
  checkFatigueRule(
    employee.id,
    requirement.date,

    /**
     * Currently known schedule.
     *
     * Later this must include newly generated shifts too.
     */
    context.existingShifts,

    /**
     * Future immutable commitments.
     */
    context.lockedShifts,

    context.categories,
  )


if (!fatigueCheck.allowed) {
  reasons.push(
    'FATIGUE_REST_REQUIRED',
  )
}



  // =========================================================
  // STEP 6 — Current ShiftBlock rules
  // =========================================================


  // ---------------------------------------------------------
  // Role slot must still be open
  // ---------------------------------------------------------

  if (
    !hasOpenRoleSlot(
      context.block,
      requirement.roleId,
    )
  ) {
    reasons.push('ROLE_SLOT_FULL')
  }


  // ---------------------------------------------------------
  // Employee cannot occupy two roles
  // inside the same block
  // ---------------------------------------------------------

  if (
    isEmployeeAlreadyAssigned(
      context.block,
      employee.id,
    )
  ) {
    reasons.push(
      'ALREADY_ASSIGNED_TO_BLOCK',
    )
  }


  // =========================================================
  // STEP 7 — Pair feasibility / lookahead
  // =========================================================

  /**
   * This is the more expensive check.
   *
   * Only run it when every earlier hard rule passed.
   */
  if (reasons.length === 0) {
    const preservesPairing =
      canStillCompletePairs({
        block: context.block,

        proposedAssignment: {
          employeeId: employee.id,
          titleId: employee.titleId,
          roleId: requirement.roleId,
        },

        candidates: context.candidates,

        titles: context.titles,

        pairRoles: context.pairRoles,
      })

    /**
     * The employee may be individually legal,
     * but assigning them could make the remaining
     * pairing impossible.
     */
    if (!preservesPairing) {
      reasons.push(
        'PAIRING_DEAD_END',
      )
    }
  }


  // =========================================================
  // FINAL RESULT
  // =========================================================

  return {
    allowed: reasons.length === 0,
    reasons,
  }
}

