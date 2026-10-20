import type {
  Shift,
} from '@/lib/types'

import type {
  ShiftBlock,
} from '../types'

import type {
  SchedulerContext,
} from '../context'

import {
  createAssignmentRuleContext,
} from '../context'

import {
  createShiftBlockState,
  seedExistingAssignments,
} from '../generation/blockState'

import {
  canAssign,
  type AssignmentRejectionReason,
} from '../rules/canAssign'

import {
  checkDailyCombination,
  type NormalTimeOfDay,
} from '../rules/daily-combination'

import {
  checkShiftSequence,
} from '../rules/sequence'

import {
  checkConsecutiveDouble,
} from '../rules/consecutive-double'

import {
  hasFatigueViolationAroundDate,
} from '../rules/fatigue'

import {
  hasNightStreakViolationAroundDate,
} from '../rules/night-streak'


export type ScheduleViolation = {
  shiftId: number
  employeeId: number
  date: string

  code: AssignmentRejectionReason

  title: string
  description: string
}


const VIOLATION_TEXT:
Record<
  AssignmentRejectionReason,
  {
    title: string
    description: string
  }
> = {

  EMPLOYEE_HAS_NO_TITLE: {
    title:
      'Employee title missing',

    description:
      'This employee does not have a valid title or rank.',
  },

  ROLE_NOT_ALLOWED: {
    title:
      'Role not allowed',

    description:
      'This employee is not allowed to work this role.',
  },

  CATEGORY_NOT_ALLOWED: {
    title:
      'Shift category not allowed',

    description:
      'This employee title is not allowed to work this shift category.',
  },

  LOCATION_NOT_ALLOWED: {
    title:
      'Location not allowed',

    description:
      'This employee is not allowed to work at this location.',
  },

  NOT_AVAILABLE: {
    title:
      'Employee unavailable',

    description:
      'This assignment conflicts with the employee working pattern or availability.',
  },

  BLOCKED_BY_LOCKED_SHIFT: {
    title:
      'Conflicting fixed shift',

    description:
      'This shift conflicts with another fixed shift such as Vacation, OFF, or Special.',
  },

  DAILY_COMBINATION_VIOLATION: {
    title:
      'Invalid same-day combination',

    description:
      'These shifts cannot be worked together on the same day.',
  },

  SHIFT_SEQUENCE_VIOLATION: {
    title:
      'Invalid shift sequence',

    description:
      'This assignment creates an invalid sequence such as Night followed by Morning.',
  },

  CONSECUTIVE_DOUBLE_SHIFT: {
    title:
      'Consecutive double shifts',

    description:
      'An employee cannot work double shifts on two consecutive days.',
  },

  FATIGUE_REST_REQUIRED: {
    title:
      'Rest required',

    description:
      'This employee has reached the continuous-work limit and requires a rest day.',
  },

  ROLE_SLOT_FULL: {
    title:
      'Role slot full',

    description:
      'This shift block already has enough employees assigned to this role.',
  },

  ALREADY_ASSIGNED_TO_BLOCK: {
    title:
      'Duplicate block assignment',

    description:
      'This employee is already assigned inside this shift block.',
  },

  PAIRING_DEAD_END: {
    title:
      'Invalid staff pairing',

    description:
      'This assignment creates a staff combination that cannot complete a valid pair.',
  },

  CONSECUTIVE_NIGHT_LIMIT: {
    title:
      'Too many consecutive Night shifts',

    description:
      'An employee cannot work Night shifts on more than three consecutive days.',
  },

}


/**
 * Find the template block that owns one shift.
 */
function findBlockForShift(
  shift: Shift,
  blocks: ShiftBlock[],
): ShiftBlock | undefined {

  return blocks.find(
    block =>
      block.date === shift.date &&
      block.locationId ===
        shift.locationId &&
      block.categoryId ===
        shift.categoryId,
  )
}

/**
 * Convert one shift category into the time bucket used
 * by the schedule-wide rules.
 *
 * Old Special shifts with timeOfDay = none count as Morning.
 */
function getCategoryTimeOfDay(
  category: SchedulerContext['categories'][number],
): NormalTimeOfDay | null {

  if (
    category.type === 'special' &&
    category.timeOfDay === 'none'
  ) {
    return 'morning'
  }

  if (
    category.timeOfDay === 'morning' ||
    category.timeOfDay === 'noon' ||
    category.timeOfDay === 'night'
  ) {
    return category.timeOfDay
  }

  return null
}


function getEmployeeTimeOfDays(
  employeeId: number,
  date: string,
  shifts: Shift[],
  context: SchedulerContext,
): NormalTimeOfDay[] {

  return shifts
    .filter(
      shift =>
        shift.employeeId === employeeId &&
        shift.date === date,
    )
    .map(shift =>
      context.categories.find(
        category =>
          category.id === shift.categoryId,
      ),
    )
    .filter(
      (
        category,
      ): category is SchedulerContext['categories'][number] =>
        category !== undefined &&
        (
          category.type === 'regular' ||
          category.type === 'special'
        ),
    )
    .map(getCategoryTimeOfDay)
    .filter(
      (
        timeOfDay,
      ): timeOfDay is NormalTimeOfDay =>
        timeOfDay !== null,
    )
}


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
 * Validate an already-built schedule.
 *
 * Technique:
 *
 * remove one shift
 *      ↓
 * ask canAssign():
 * "Would putting this shift back be legal?"
 *
 * This prevents the shift from conflicting
 * with itself.
 */
export function validateSchedule(
  context: SchedulerContext,
  blocks: ShiftBlock[],
): ScheduleViolation[] {

  const violations:
    ScheduleViolation[] = []


  /**
   * Copy because validation must never
   * mutate the real schedule.
   */
  const schedule = [
    ...context.workingShifts,
  ]


  for (const shift of schedule) {

    // -------------------------------------------------------
    // Ignore Open slots
    // -------------------------------------------------------

    if (
      shift.employeeId === null
    ) {
      continue
    }


    const employee =
      context.employees.find(
        employee =>
          employee.id ===
          shift.employeeId,
      )


    if (!employee) {
      continue
    }


    const category =
      context.categories.find(
        category =>
          category.id ===
          shift.categoryId,
      )


    if (!category) {
      continue
    }


    /**
     * Schedule-wide rules can be checked even when the
     * manually-created shift does not have a role yet.
     *
     * These rules only care about:
     *
     * - employee
     * - date
     * - category / time of day
     *
     * Role-specific checks happen later.
     */
    if (
    category.type !== 'regular' &&
    category.type !== 'special'
    ) {
    continue
    }


    /**
     * Remove this shift first, then ask:
     *
     * "Would putting this shift back create an illegal
     * schedule pattern?"
     */
    const scheduleWithoutShift =
    schedule.filter(
        other =>
        other.id !== shift.id,
    )


    const proposedTimeOfDay =
    getCategoryTimeOfDay(
        category,
    )

    // =======================================================
    // MAXIMUM CONSECUTIVE NIGHT DAYS
    // =======================================================

    if (
      proposedTimeOfDay === 'night' &&
      hasNightStreakViolationAroundDate(
        employee.id,
        shift.date,
        schedule,
        context.categories,
      )
    ) {

      const text =
        VIOLATION_TEXT[
          'CONSECUTIVE_NIGHT_LIMIT'
        ]


      violations.push({
        shiftId:
          shift.id,

        employeeId:
          employee.id,

        date:
          shift.date,

        code:
          'CONSECUTIVE_NIGHT_LIMIT',

        title:
          text.title,

        description:
          text.description,
      })
    }


    if (proposedTimeOfDay) {

    const previousDate =
        addDays(
        shift.date,
        -1,
        )

    const nextDate =
        addDays(
        shift.date,
        1,
        )


    // =======================================================
    // SAME-DAY COMBINATION
    // =======================================================

    const todayTimeOfDays =
        getEmployeeTimeOfDays(
        employee.id,
        shift.date,
        scheduleWithoutShift,
        context,
        )


    const dailyCheck =
        checkDailyCombination(
        todayTimeOfDays,
        proposedTimeOfDay,
        )


    if (!dailyCheck.allowed) {

        const text =
        VIOLATION_TEXT[
            'DAILY_COMBINATION_VIOLATION'
        ]

        violations.push({
        shiftId:
            shift.id,

        employeeId:
            employee.id,

        date:
            shift.date,

        code:
            'DAILY_COMBINATION_VIOLATION',

        title:
            text.title,

        description:
            text.description,
        })
    }


    // =======================================================
    // NIGHT -> MORNING SEQUENCE
    // =======================================================

    const previousTimeOfDays =
        getEmployeeTimeOfDays(
        employee.id,
        previousDate,
        scheduleWithoutShift,
        context,
        )


    const nextTimeOfDays =
        getEmployeeTimeOfDays(
        employee.id,
        nextDate,
        scheduleWithoutShift,
        context,
        )


    const sequenceCheck =
        checkShiftSequence(
        previousTimeOfDays,
        proposedTimeOfDay,
        nextTimeOfDays,
        )


    if (!sequenceCheck.allowed) {

        const text =
        VIOLATION_TEXT[
            'SHIFT_SEQUENCE_VIOLATION'
        ]

        violations.push({
        shiftId:
            shift.id,

        employeeId:
            employee.id,

        date:
            shift.date,

        code:
            'SHIFT_SEQUENCE_VIOLATION',

        title:
            text.title,

        description:
            text.description,
        })
    }


    // =======================================================
    // CONSECUTIVE DOUBLE SHIFT
    // =======================================================

    const doubleCheck =
        checkConsecutiveDouble(
        employee.id,
        shift.date,
        previousDate,
        nextDate,
        scheduleWithoutShift,
        context.categories,
        )


    if (!doubleCheck.allowed) {

        const text =
        VIOLATION_TEXT[
            'CONSECUTIVE_DOUBLE_SHIFT'
        ]

        violations.push({
        shiftId:
            shift.id,

        employeeId:
            employee.id,

        date:
            shift.date,

        code:
            'CONSECUTIVE_DOUBLE_SHIFT',

        title:
            text.title,

        description:
            text.description,
        })
    }
    }


    // =========================================================
    // COMPLETE FATIGUE AUDIT
    // =========================================================

    if (
    hasFatigueViolationAroundDate(
        employee.id,
        shift.date,
        schedule,
        context.categories,
    )
    ) {

    const text =
        VIOLATION_TEXT[
        'FATIGUE_REST_REQUIRED'
        ]

    violations.push({
        shiftId:
        shift.id,

        employeeId:
        employee.id,

        date:
        shift.date,

        code:
        'FATIGUE_REST_REQUIRED',

        title:
        text.title,

        description:
        text.description,
    })
    }


    /**
     * From here onward the remaining checks require
     * an actual role/template block.
     *
     * A floating manual shift can stop here,
     * but the violations found above are KEPT.
     */
    if (shift.roleId === null) {
    continue
    }


    const block =
      findBlockForShift(
        shift,
        blocks,
      )


    /**
     * An ad-hoc regular shift may not belong
     * to a configured template block.
     *
     * For v1 we skip block-dependent checking here.
     */
    if (!block) {
      continue
    }




    /**
     * If the shift is inside lockedShifts,
     * remove it there too.
     *
     * Otherwise it could block itself.
     */
    const lockedWithoutShift =
      context.lockedShifts.filter(
        other =>
          other.id !== shift.id,
      )


    // =======================================================
    // Rebuild its block using the remaining schedule
    // =======================================================

    let blockState =
      createShiftBlockState(
        block,
      )


    blockState =
      seedExistingAssignments(
        blockState,
        scheduleWithoutShift,
        context.employees,
      )


    const temporaryContext:
      SchedulerContext = {
        ...context,

        workingShifts:
          scheduleWithoutShift,

        lockedShifts:
          lockedWithoutShift,
      }


    const ruleContext =
      createAssignmentRuleContext(
        temporaryContext,
        blockState,
      )


    // =======================================================
    // Ask the REAL scheduler hard-rule checker
    // =======================================================

    const check =
      canAssign(
        employee,
        {
          date:
            shift.date,

          locationId:
            shift.locationId,

          roleId:
            shift.roleId,

          categoryId:
            shift.categoryId,
        },
        ruleContext,
      )


    if (check.allowed) {
      continue
    }


    // =======================================================
    // Convert rule codes into frontend-friendly messages
    // =======================================================

    for (
    const reason
    of check.reasons
    ) {

    /**
     * Already checked above for every shift,
     * including roleless manual shifts.
     *
     * Do not add duplicate messages.
     */
    if (
        reason ===
        'DAILY_COMBINATION_VIOLATION' ||
        reason ===
        'CONSECUTIVE_NIGHT_LIMIT' ||
        reason ===
        'SHIFT_SEQUENCE_VIOLATION' ||
        reason ===
        'CONSECUTIVE_DOUBLE_SHIFT' ||
        reason ===
        'FATIGUE_REST_REQUIRED'
    ) {
        continue
    }


    const text =
        VIOLATION_TEXT[
        reason
        ]

    violations.push({
        shiftId:
        shift.id,

        employeeId:
        employee.id,

        date:
        shift.date,

        code:
        reason,

        title:
        text.title,

        description:
        text.description,
    })
    }
  }


  return violations
}