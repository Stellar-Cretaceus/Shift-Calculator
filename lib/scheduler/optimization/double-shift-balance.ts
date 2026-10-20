import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'

import type {
  SchedulerContext,
} from '../context'

import type {
  ShiftBlock,
} from '../types'

import {
  createAssignmentRuleContext,
} from '../context'

import {
  createShiftBlockState,
  seedExistingAssignments,
} from '../generation/blockState'

import {
  canAssign,
} from '../rules/canAssign'

import {
  hasFatigueViolationAroundDate,
} from '../rules/fatigue'

import {
  worsensTimeOfDayBalanceBeyondLimit,
} from '../scoring/category-balance'


const WINDOW_DAYS = 7

/**
 * We tolerate at most 2 double-shift days
 * inside any rolling 7-day window.
 *
 * 3+ is considered overloaded.
 */
const MAX_DOUBLE_DAYS_PER_WINDOW = 2


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
 * Count how many work shifts this employee has
 * on one exact date.
 */
function countWorkShiftsOnDate(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {
  return shifts.filter(
    shift =>
      shift.employeeId === employeeId &&
      shift.date === date &&
      isWorkingShift(
        shift,
        categories,
      ),
  ).length
}


/**
 * Add calendar days safely.
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
 * Collect every date on which this employee
 * currently has a double shift.
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
      (counts.get(shift.date) ?? 0) + 1,
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
 * How bad is ONE employee's double clustering?
 *
 * For every rolling 7-day window:
 *
 * 0,1,2 doubles = fine
 * 3 doubles     = excess 1
 * 4 doubles     = excess 2
 *
 * We SUM the excess across windows.
 */
function getEmployeeDoubleExcess(
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


  const firstDate =
    doubleDates[0]

  const lastDate =
    doubleDates[
      doubleDates.length - 1
    ]

  let windowStart =
    firstDate

  let totalExcess = 0


  while (
    windowStart <= lastDate
  ) {
    const windowEnd =
      addDays(
        windowStart,
        WINDOW_DAYS - 1,
      )

    const doubleCount =
      doubleDates.filter(
        date =>
          date >= windowStart &&
          date <= windowEnd,
      ).length


    totalExcess +=
      Math.max(
        0,
        doubleCount -
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


/**
 * Global overload score.
 *
 * Lower = better.
 * Zero = nobody has more than 2 doubles
 * in any rolling 7-day window.
 */
function getGlobalDoubleExcess(
  context: SchedulerContext,
  shifts: Shift[],
): number {
  return context.employees.reduce(
    (total, employee) =>
      total +
      getEmployeeDoubleExcess(
        employee.id,
        shifts,
        context.categories,
      ),
    0,
  )
}


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
 * Actually change the owner of a generated shift.
 */
function applyTransfer(
  shiftId: number,
  newEmployeeId: number,
  context: SchedulerContext,
): void {

  for (
    const shift
    of context.generatedShifts
  ) {
    if (shift.id === shiftId) {
      shift.employeeId =
        newEmployeeId
    }
  }


  for (
    const shift
    of context.workingShifts
  ) {
    if (shift.id === shiftId) {
      shift.employeeId =
        newEmployeeId
    }
  }
}


/**
 * Try to reduce overloaded double-shift clusters.
 *
 * IMPORTANT:
 *
 * - Only generated shifts can move.
 * - Mandatory generated shifts cannot move.
 * - Special/manual/locked shifts cannot move.
 * - Receiver must have ZERO work shifts that day.
 * - canAssign() must approve the move.
 * - Global rolling-7 overload must strictly improve.
 */
export function balanceDoubleShiftClusters(
  context: SchedulerContext,
  blocks: ShiftBlock[],
): void {

  /**
   * Keep making improvements until one full pass
   * cannot find any better transfer.
   */
  let improved = true


  while (improved) {
    improved = false

    const beforeGlobalExcess =
      getGlobalDoubleExcess(
        context,
        context.workingShifts,
      )


    /**
     * Already clean enough.
     */
    if (beforeGlobalExcess === 0) {
      return
    }


    for (
      const sourceEmployee
      of context.employees
    ) {

      const sourceExcess =
        getEmployeeDoubleExcess(
          sourceEmployee.id,
          context.workingShifts,
          context.categories,
        )


      /**
       * This employee is not overloaded.
       */
      if (sourceExcess === 0) {
        continue
      }


      const doubleDates =
        new Set(
          getDoubleShiftDates(
            sourceEmployee.id,
            context.workingShifts,
            context.categories,
          ),
        )


      /**
       * Only generated, movable shifts
       * on this person's double-shift days.
       */
      const movableShifts =
        context.generatedShifts.filter(
          shift => {

            if (
              shift.employeeId !==
              sourceEmployee.id
            ) {
              return false
            }


            if (
              !doubleDates.has(
                shift.date,
              )
            ) {
              return false
            }


            /**
             * Mandatory work must stay.
             */
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


            /**
             * Only normal generated shifts move.
             */
            return (
              category?.type ===
              'regular'
            )
          },
        )


      for (
        const shiftToMove
        of movableShifts
      ) {

        if (
          shiftToMove.roleId === null
        ) {
          continue
        }


        const block =
          findBlockForShift(
            shiftToMove,
            blocks,
          )

        if (!block) {
          continue
        }


        /**
         * Remove the source assignment FIRST.
         *
         * canAssign() should judge the schedule
         * as it would exist after Alice gives up
         * this shift.
         */
        const withoutSourceShift =
          context.workingShifts.filter(
            shift =>
              shift.id !==
              shiftToMove.id,
          )


        for (
          const targetEmployee
          of context.employees
        ) {

          if (
            targetEmployee.id ===
            sourceEmployee.id
          ) {
            continue
          }


          /**
           * VERY IMPORTANT:
           *
           * Do not fix Alice's double
           * by creating a double for Bob.
           */
          const targetWorkToday =
            countWorkShiftsOnDate(
              targetEmployee.id,
              shiftToMove.date,
              withoutSourceShift,
              context.categories,
            )

          if (targetWorkToday > 0) {
            continue
          }


          /**
           * Rebuild this shift block without
           * the assignment we're trying to move.
           */
          let blockState =
            createShiftBlockState(
              block,
            )

          blockState =
            seedExistingAssignments(
              blockState,
              withoutSourceShift,
              context.employees,
            )


          /**
           * Temporary context:
           * hard-rule checker sees the simulated
           * schedule, not the current real one.
           */
          const temporaryContext:
            SchedulerContext = {
              ...context,

              workingShifts:
                withoutSourceShift,
            }


          const ruleContext =
            createAssignmentRuleContext(
              temporaryContext,
              blockState,
            )


          const check =
            canAssign(
              targetEmployee,
              {
                date:
                  shiftToMove.date,

                locationId:
                  shiftToMove.locationId,

                roleId:
                  shiftToMove.roleId,

                categoryId:
                  shiftToMove.categoryId,
              },
              ruleContext,
            )


          if (!check.allowed) {
            continue
          }


          /**
           * Simulate the full transfer.
           */
          const simulatedShifts =
            withoutSourceShift.concat({
              ...shiftToMove,

              employeeId:
                targetEmployee.id,
            })

            const sourceBalanceWorsened =
            worsensTimeOfDayBalanceBeyondLimit(
              sourceEmployee.id,
              context.workingShifts,
              simulatedShifts,
              context.categories,
            )


          const targetBalanceWorsened =
            worsensTimeOfDayBalanceBeyondLimit(
              targetEmployee.id,
              context.workingShifts,
              simulatedShifts,
              context.categories,
            )


          if (
            sourceBalanceWorsened ||
            targetBalanceWorsened
          ) {
            continue
          }


            const sourceFatigueViolation =
              hasFatigueViolationAroundDate(
                sourceEmployee.id,
                shiftToMove.date,
                simulatedShifts,
                context.categories,
              )


            const targetFatigueViolation =
              hasFatigueViolationAroundDate(
                targetEmployee.id,
                shiftToMove.date,
                simulatedShifts,
                context.categories,
              )


            if (
              sourceFatigueViolation ||
              targetFatigueViolation
            ) {
              continue
            }


          const afterGlobalExcess =
            getGlobalDoubleExcess(
              context,
              simulatedShifts,
            )


          /**
           * Critical safety condition:
           *
           * Don't merely MOVE the problem.
           * The global overload must actually improve.
           */
          if (
            afterGlobalExcess >=
            beforeGlobalExcess
          ) {
            continue
          }


          /**
           * Safe improvement found.
           */
          applyTransfer(
            shiftToMove.id,
            targetEmployee.id,
            context,
          )


          console.log(
            '[double-balance] transferred',
            {
              shiftId:
                shiftToMove.id,

              date:
                shiftToMove.date,

              from:
                sourceEmployee.id,

              to:
                targetEmployee.id,

              before:
                beforeGlobalExcess,

              after:
                afterGlobalExcess,
            },
          )


          /**
           * Restart from the new schedule,
           * because all later calculations changed.
           */
          improved = true
          break
        }


        if (improved) {
          break
        }
      }


      if (improved) {
        break
      }
    }
  }
}