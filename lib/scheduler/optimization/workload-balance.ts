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
  getEmployeeTimeOfDayCounts,
  type NormalTimeOfDay,
} from '../scoring/category-balance'

import {
  canTransferGeneratedShift,
  applyGeneratedShiftTransfer,
} from './transfer'


const MAX_WORKLOAD_TRANSFERS = 50


/**
 * Is this category actual work?
 */
function isWorkingShift(
  shift: Shift,
  context: SchedulerContext,
): boolean {
  const category =
    context.categories.find(
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
}


/**
 * Count UNIQUE dates on which this employee works.
 *
 * Morning + Noon on one date
 * still equals ONE working day.
 */
function countWorkingDays(
  employeeId: number,
  context: SchedulerContext,
): number {

  const dates =
    new Set<string>()

  for (
    const shift
    of context.workingShifts
  ) {
    if (
      shift.employeeId !== employeeId
    ) {
      continue
    }

    if (
      !isWorkingShift(
        shift,
        context,
      )
    ) {
      continue
    }

    dates.add(
      shift.date,
    )
  }

  return dates.size
}


/**
 * Find Morning / Noon / Night for one shift.
 */
function getShiftTimeOfDay(
  shift: Shift,
  context: SchedulerContext,
): NormalTimeOfDay | null {

  const category =
    context.categories.find(
      category =>
        category.id === shift.categoryId,
    )

  if (!category) {
    return null
  }

  if (
    category.timeOfDay !== 'morning' &&
    category.timeOfDay !== 'noon' &&
    category.timeOfDay !== 'night'
  ) {
    return null
  }

  return category.timeOfDay
}


/**
 * Try to improve working-day distribution.
 *
 * Very conservative first version:
 *
 * 1. donor must have at least 2 more working days
 * 2. donor must have at least 2 more of the transferred
 *    Morning/Noon/Night bucket
 * 3. shift must be movable
 * 4. receiver must pass every hard rule
 *
 * Accept first safe strict improvement, then restart.
 */
export function balanceWorkingDays(
  context: SchedulerContext,
  blocks: ShiftBlock[],
): number {

  let acceptedTransfers = 0


  while (
    acceptedTransfers <
    MAX_WORKLOAD_TRANSFERS
  ) {

    let improved = false


    for (
      const shift
      of context.generatedShifts
    ) {

      if (
        shift.employeeId === null ||
        shift.roleId === null
      ) {
        continue
      }


      // Mandatory-generated assignments are protected.
      if (
        context
          .mandatoryGeneratedShiftIds
          .has(shift.id)
      ) {
        continue
      }


      const donorId =
        shift.employeeId


      const donorWorkingDays =
        countWorkingDays(
          donorId,
          context,
        )


      const timeOfDay =
        getShiftTimeOfDay(
          shift,
          context,
        )

      if (!timeOfDay) {
        continue
      }


      const donorTimeCounts =
        getEmployeeTimeOfDayCounts(
          donorId,
          context.workingShifts,
          context.categories,
        )


      for (
        const receiver
        of context.employees
      ) {

        if (
          receiver.id === donorId
        ) {
          continue
        }


        const receiverWorkingDays =
          countWorkingDays(
            receiver.id,
            context,
          )


        // ---------------------------------------------------
        // Strict workload improvement.
        //
        // Example:
        //
        // donor = 29
        // receiver = 26
        //
        // difference = 3 -> worth trying
        //
        // donor = 28
        // receiver = 27
        //
        // difference = 1 -> leave it alone
        // ---------------------------------------------------

        if (
          donorWorkingDays -
          receiverWorkingDays <
          2
        ) {
          continue
        }


        const receiverTimeCounts =
          getEmployeeTimeOfDayCounts(
            receiver.id,
            context.workingShifts,
            context.categories,
          )


        // ---------------------------------------------------
        // Also require THIS category to become more balanced.
        //
        // Example Night:
        //
        // donor Night = 10
        // receiver Night = 8
        //
        // after transfer:
        //
        // donor = 9
        // receiver = 9
        //
        // Great.
        //
        // This prevents workload balancing from destroying
        // the nice Morning/Noon/Night distribution.
        // ---------------------------------------------------

        if (
          donorTimeCounts[timeOfDay] -
          receiverTimeCounts[timeOfDay] <
          2
        ) {
          continue
        }


        const transferCheck =
          canTransferGeneratedShift(
            shift,
            receiver,
            blocks,
            context,
          )


        if (
          !transferCheck.allowed
        ) {
          continue
        }


        // ---------------------------------------------------
        // Accepted.
        //
        // This MUST strictly improve:
        //
        // working-day gap
        // AND
        // this category's gap
        //
        // Therefore the optimizer cannot bounce forever.
        // ---------------------------------------------------

        applyGeneratedShiftTransfer(
          shift,
          receiver.id,
          context,
        )


        acceptedTransfers++

        improved = true

        break
      }


      if (improved) {
        break
      }
    }


    // Nothing legal + improving exists.
    if (!improved) {
      break
    }
  }


  console.log(
    `[scheduler] Workload balance transfers: ${acceptedTransfers}`,
  )


  return acceptedTransfers
}