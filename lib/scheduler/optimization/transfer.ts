import type {
  Employee,
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
  type AssignmentCheck,
} from '../rules/canAssign'

import {
  hasFatigueViolationAroundDate,
} from '../rules/fatigue'

import {
  worsensTimeOfDayBalanceBeyondLimit,
} from '../scoring/category-balance'

export type TransferCheck = {
  allowed: boolean

  receiverCheck?: AssignmentCheck
}


/**
 * Find the block containing this generated shift.
 */
function findBlockForShift(
  shift: Shift,
  blocks: ShiftBlock[],
): ShiftBlock | undefined {
  return blocks.find(
    block =>
      block.date === shift.date &&
      block.locationId === shift.locationId &&
      block.categoryId === shift.categoryId,
  )
}


/**
 * Count actual work shifts on one date.
 *
 * regular + special = work
 * vacation + off = not work
 */
function countEmployeeWorkShiftsOnDate(
  employeeId: number,
  date: string,
  context: SchedulerContext,
): number {
  return context.workingShifts.filter(
    shift => {

      if (
        shift.employeeId !== employeeId ||
        shift.date !== date
      ) {
        return false
      }

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
    },
  ).length
}


/**
 * Check whether one GENERATED shift may move:
 *
 * donor -> receiver
 *
 * The date/category/location/role remain unchanged.
 * Only employeeId changes.
 */
export function canTransferGeneratedShift(
  shift: Shift,
  receiver: Employee,
  blocks: ShiftBlock[],
  context: SchedulerContext,
): TransferCheck {

  // -------------------------------------------------------
  // Basic sanity
  // -------------------------------------------------------

  if (
    shift.employeeId === null ||
    shift.roleId === null ||
    shift.employeeId === receiver.id
  ) {
    return {
      allowed: false,
    }
  }


  // -------------------------------------------------------
  // Only ordinary generated shifts may move.
  //
  // Manual / locked shifts are not in generatedShifts.
  // Mandatory-generated shifts are explicitly protected.
  // -------------------------------------------------------

  const isGenerated =
    context.generatedShifts.some(
      generated =>
        generated.id === shift.id,
    )

  if (!isGenerated) {
    return {
      allowed: false,
    }
  }


  if (
    context.mandatoryGeneratedShiftIds.has(
      shift.id,
    )
  ) {
    return {
      allowed: false,
    }
  }


  // -------------------------------------------------------
  // We want a REAL workday transfer.
  //
  // Donor must currently have exactly one work shift
  // on this date.
  //
  // Otherwise removing this shift would not create
  // an OFF/non-working day for them.
  // -------------------------------------------------------

  const donorWorkCount =
    countEmployeeWorkShiftsOnDate(
      shift.employeeId,
      shift.date,
      context,
    )

  if (donorWorkCount !== 1) {
    return {
      allowed: false,
    }
  }


  // -------------------------------------------------------
  // Receiver must currently have no work on this date.
  //
  // This means:
  //
  // donor: work -> no work
  // receiver: no work -> work
  //
  // So working-day balance genuinely changes.
  // -------------------------------------------------------

  const receiverWorkCount =
    countEmployeeWorkShiftsOnDate(
      receiver.id,
      shift.date,
      context,
    )

  if (receiverWorkCount !== 0) {
    return {
      allowed: false,
    }
  }


  // -------------------------------------------------------
  // Temporarily remove donor's old assignment.
  //
  // We need canAssign() to see the target role slot
  // as empty.
  // -------------------------------------------------------

  const temporaryWorkingShifts =
    context.workingShifts.filter(
      existingShift =>
        existingShift.id !== shift.id,
    )


  const block =
    findBlockForShift(
      shift,
      blocks,
    )

  if (!block) {
    return {
      allowed: false,
    }
  }


  let state =
    createShiftBlockState(
      block,
    )

  state =
    seedExistingAssignments(
      state,
      temporaryWorkingShifts,
      context.employees,
    )


  // -------------------------------------------------------
  // Give canAssign() the simulated schedule WITHOUT
  // donor's old assignment.
  //
  // Therefore every normal hard rule is checked:
  //
  // - role permission
  // - availability
  // - locked conflicts
  // - daily combinations
  // - Night -> Morning
  // - consecutive double
  // - fatigue / 7-shift rule
  // - role capacity
  // - pair feasibility
  // -------------------------------------------------------

  const temporaryContext:
    SchedulerContext = {
      ...context,

      workingShifts:
        temporaryWorkingShifts,
    }


  const ruleContext =
    createAssignmentRuleContext(
      temporaryContext,
      state,
    )


  const receiverCheck =
    canAssign(
      receiver,
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


  if (!receiverCheck.allowed) {
    return {
      allowed: false,
      receiverCheck,
    }
  }

  // =========================================================
  // FINAL FATIGUE AUDIT
  // =========================================================

  const simulatedSchedule =
    temporaryWorkingShifts.concat({
      ...shift,

      employeeId:
        receiver.id,
    })

  // =========================================================
  // CATEGORY-BALANCE SAFETY
  // =========================================================

  const donorBalanceWorsened =
    worsensTimeOfDayBalanceBeyondLimit(
      shift.employeeId,
      context.workingShifts,
      simulatedSchedule,
      context.categories,
    )


  const receiverBalanceWorsened =
    worsensTimeOfDayBalanceBeyondLimit(
      receiver.id,
      context.workingShifts,
      simulatedSchedule,
      context.categories,
    )


  if (
    donorBalanceWorsened ||
    receiverBalanceWorsened
  ) {
    return {
      allowed: false,
      receiverCheck,
    }
  }

  /**
   * Receiver gained work.
   */
  const receiverFatigueViolation =
    hasFatigueViolationAroundDate(
      receiver.id,
      shift.date,
      simulatedSchedule,
      context.categories,
    )


  /**
   * Donor lost work.
   *
   * Normally removing work cannot make fatigue worse,
   * but checking both sides keeps transfer validation
   * symmetric and safe.
   */
  const donorFatigueViolation =
    hasFatigueViolationAroundDate(
      shift.employeeId,
      shift.date,
      simulatedSchedule,
      context.categories,
    )


  if (
    receiverFatigueViolation ||
    donorFatigueViolation
  ) {
    return {
      allowed: false,
      receiverCheck,
    }
  }


  return {
    allowed: true,
    receiverCheck,
  }
}


/**
 * Actually perform an already-approved transfer.
 *
 * We ONLY change employeeId.
 *
 * Role/category/date/location stay attached
 * to the same required shift slot.
 */
export function applyGeneratedShiftTransfer(
  shift: Shift,
  receiverId: number,
  context: SchedulerContext,
): void {

  for (
    const generatedShift
    of context.generatedShifts
  ) {
    if (
      generatedShift.id === shift.id
    ) {
      generatedShift.employeeId =
        receiverId
    }
  }


  for (
    const workingShift
    of context.workingShifts
  ) {
    if (
      workingShift.id === shift.id
    ) {
      workingShift.employeeId =
        receiverId
    }
  }
}