import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'

import type {
  ShiftBlock,
} from '../types'

import type {
  SchedulerContext,
} from '../context'

import {
  canSwapGeneratedShifts,
  applyGeneratedShiftSwap,
} from './swap'


const MAX_DOUBLE_DAYS_PER_WINDOW = 2
const WINDOW_DAYS = 7

/**
 * Spacing preference:
 *
 * Double days 2 days apart = bad
 * Double days 3 days apart = mildly bad
 * 4+ days apart = fine
 *
 * Consecutive double days are already forbidden
 * by the hard-rule layer.
 */
const TWO_DAY_GAP_PENALTY = 2
const THREE_DAY_GAP_PENALTY = 1


function findCategory(
  categoryId: number,
  categories: ShiftCategory[],
): ShiftCategory | undefined {
  return categories.find(
    category =>
      category.id === categoryId,
  )
}


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
 * Only normal generated shifts may participate
 * in the spacing optimizer.
 *
 * Special/manual/locked shifts stay fixed.
 */
function isMovableRegularShift(
  shift: Shift,
  context: SchedulerContext,
): boolean {
  if (
    shift.employeeId === null ||
    shift.roleId === null
  ) {
    return false
  }

  if (
    context
      .mandatoryGeneratedShiftIds
      .has(shift.id)
  ) {
    return false
  }

  const category =
    findCategory(
      shift.categoryId,
      context.categories,
    )

  return category?.type === 'regular'
}


/**
 * YYYY-MM-DD -> integer calendar day.
 *
 * Using UTC here avoids DST/timezone weirdness
 * when comparing dates.
 */
function getDayNumber(
  date: string,
): number {
  const [
    year,
    month,
    day,
  ] =
    date
      .split('-')
      .map(Number)

  return Math.floor(
    Date.UTC(
      year,
      month - 1,
      day,
    ) /
    86400000,
  )
}


function addDays(
  date: string,
  amount: number,
): string {
  const [
    year,
    month,
    day,
  ] =
    date
      .split('-')
      .map(Number)

  const value =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day + amount,
      ),
    )

  return value
    .toISOString()
    .slice(0, 10)
}


/**
 * Return all dates where this employee
 * has 2+ working shifts.
 */
function getDoubleShiftDates(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): string[] {

  const counts =
    new Map<string, number>()


  for (const shift of shifts) {

    if (
      shift.employeeId !== employeeId ||
      !isWorkingShift(
        shift,
        categories,
      )
    ) {
      continue
    }


    counts.set(
      shift.date,
      (
        counts.get(
          shift.date,
        ) ?? 0
      ) + 1,
    )
  }


  return Array.from(
    counts.entries(),
  )
    .filter(
      ([, count]) =>
        count >= 2,
    )
    .map(
      ([date]) => date,
    )
    .sort()
}


/**
 * Existing cluster rule:
 *
 * 0-2 doubles inside 7 days = okay
 * 3 doubles = excess 1
 * 4 doubles = excess 2
 *
 * This protects the work already done by
 * double-shift-balance.ts.
 */
function getEmployeeClusterExcess(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {

  const doubleDates =
    getDoubleShiftDates(
      employeeId,
      shifts,
      categories,
    )


  if (doubleDates.length === 0) {
    return 0
  }


  let totalExcess = 0

  let windowStart =
    doubleDates[0]

  const lastDate =
    doubleDates[
      doubleDates.length - 1
    ]


  while (
    windowStart <= lastDate
  ) {

    const windowEnd =
      addDays(
        windowStart,
        WINDOW_DAYS - 1,
      )


    const count =
      doubleDates.filter(
        date =>
          date >= windowStart &&
          date <= windowEnd,
      ).length


    totalExcess +=
      Math.max(
        0,
        count -
          MAX_DOUBLE_DAYS_PER_WINDOW,
      )


    windowStart =
      addDays(
        windowStart,
        1,
      )
  }


  return totalExcess
}


function getGlobalClusterExcess(
  context: SchedulerContext,
  shifts: Shift[],
): number {

  return context.employees.reduce(
    (total, employee) =>
      total +
      getEmployeeClusterExcess(
        employee.id,
        shifts,
        context.categories,
      ),
    0,
  )
}


/**
 * Spacing score for ONE employee.
 *
 * Examples:
 *
 * Double on day 1 + day 3
 * gap = 2 -> +2
 *
 * Double on day 1 + day 4
 * gap = 3 -> +1
 *
 * Double on day 1 + day 5
 * gap = 4 -> +0
 */
function getEmployeeSpacingPenalty(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {

  const dates =
    getDoubleShiftDates(
      employeeId,
      shifts,
      categories,
    )


  let penalty = 0


  for (
    let index = 1;
    index < dates.length;
    index++
  ) {

    const previous =
      getDayNumber(
        dates[index - 1],
      )

    const current =
      getDayNumber(
        dates[index],
      )

    const gap =
      current - previous


    if (gap === 2) {
      penalty +=
        TWO_DAY_GAP_PENALTY
    } else if (gap === 3) {
      penalty +=
        THREE_DAY_GAP_PENALTY
    }
  }


  return penalty
}


function getGlobalSpacingPenalty(
  context: SchedulerContext,
  shifts: Shift[],
): number {

  return context.employees.reduce(
    (total, employee) =>
      total +
      getEmployeeSpacingPenalty(
        employee.id,
        shifts,
        context.categories,
      ),
    0,
  )
}


/**
 * Simulate exchanging the employees
 * assigned to two shift slots.
 *
 * We do NOT mutate the actual scheduler here.
 */
function simulateSwap(
  firstShift: Shift,
  secondShift: Shift,
  shifts: Shift[],
): Shift[] {

  if (
    firstShift.employeeId === null ||
    secondShift.employeeId === null
  ) {
    return shifts
  }


  const firstEmployeeId =
    firstShift.employeeId

  const secondEmployeeId =
    secondShift.employeeId


  return shifts.map(shift => {

    if (
      shift.id === firstShift.id
    ) {
      return {
        ...shift,

        employeeId:
          secondEmployeeId,
      }
    }


    if (
      shift.id === secondShift.id
    ) {
      return {
        ...shift,

        employeeId:
          firstEmployeeId,
      }
    }


    return shift
  })
}


/**
 * Final cleanup optimizer.
 *
 * Goal:
 *
 * Double -> single -> Double
 *
 * should preferably become something with
 * more distance between double-shift days.
 *
 *
 * IMPORTANT:
 *
 * A swap is accepted ONLY when:
 *
 * 1. both sides pass every hard rule
 * 2. rolling-7 clustering does not get worse
 * 3. global spacing penalty strictly improves
 * 4. mandatory/manual/locked shifts are untouched
 */
export function optimizeDoubleShiftSpacing(
  context: SchedulerContext,
  blocks: ShiftBlock[],
): void {

  let improved = true

  /**
   * Safety limit.
   *
   * Strictly decreasing score should already prevent
   * endless loops, but this gives us an extra guard.
   */
  let passes = 0

  const MAX_PASSES = 100


  while (
    improved &&
    passes < MAX_PASSES
  ) {

    passes++
    improved = false


    const beforeCluster =
      getGlobalClusterExcess(
        context,
        context.workingShifts,
      )


    const beforeSpacing =
      getGlobalSpacingPenalty(
        context,
        context.workingShifts,
      )


    /**
     * Nothing ugly remains.
     */
    if (beforeSpacing === 0) {
      break
    }


    /**
     * Only non-mandatory generated regular shifts
     * may move.
     */
    const movableShifts =
      context.generatedShifts.filter(
        shift =>
          isMovableRegularShift(
            shift,
            context,
          ),
      )


    /**
     * We only need to start swaps from employees
     * who currently have bad double spacing.
     */
    const badEmployeeIds =
      new Set(
        context.employees
          .filter(
            employee =>
              getEmployeeSpacingPenalty(
                employee.id,
                context.workingShifts,
                context.categories,
              ) > 0,
          )
          .map(
            employee =>
              employee.id,
          ),
      )


    const sourceShifts =
      movableShifts.filter(
        shift =>
          shift.employeeId !== null &&
          badEmployeeIds.has(
            shift.employeeId,
          ),
      )


    for (
      const firstShift
      of sourceShifts
    ) {

      for (
        const secondShift
        of movableShifts
      ) {

        if (
          firstShift.id ===
          secondShift.id
        ) {
          continue
        }


        if (
          firstShift.employeeId === null ||
          secondShift.employeeId === null
        ) {
          continue
        }


        if (
          firstShift.employeeId ===
          secondShift.employeeId
        ) {
          continue
        }


        /**
         * Hard-rule safety first.
         *
         * swap.ts already checks both replacement
         * assignments using canAssign().
         */
        const swapCheck =
          canSwapGeneratedShifts(
            firstShift,
            secondShift,
            blocks,
            context,
          )


        if (!swapCheck.allowed) {
          continue
        }


        const simulatedShifts =
          simulateSwap(
            firstShift,
            secondShift,
            context.workingShifts,
          )


        const afterCluster =
          getGlobalClusterExcess(
            context,
            simulatedShifts,
          )


        /**
         * CRITICAL:
         *
         * Spacing optimizer may never undo
         * double-cluster cleanup.
         */
        if (
          afterCluster >
          beforeCluster
        ) {
          continue
        }


        const afterSpacing =
          getGlobalSpacingPenalty(
            context,
            simulatedShifts,
          )


        /**
         * We require a REAL global improvement.
         *
         * Not:
         *
         * Alice gets better
         * Bob gets equally worse.
         */
        if (
          afterSpacing >=
          beforeSpacing
        ) {
          continue
        }


        /**
         * Safe improvement found.
         */
        applyGeneratedShiftSwap(
          firstShift,
          secondShift,
          context,
        )


        console.log(
          '[double-spacing] swap accepted',
          {
            firstShiftId:
              firstShift.id,

            secondShiftId:
              secondShift.id,

            beforeCluster,
            afterCluster,

            beforeSpacing,
            afterSpacing,
          },
        )


        /**
         * Schedule changed.
         *
         * Recalculate everything from scratch
         * before attempting another swap.
         */
        improved = true
        break
      }


      if (improved) {
        break
      }
    }
  }


  console.log(
    '[double-spacing] finished',
    {
      passes,

      cluster:
        getGlobalClusterExcess(
          context,
          context.workingShifts,
        ),

      spacing:
        getGlobalSpacingPenalty(
          context,
          context.workingShifts,
        ),
    },
  )
}