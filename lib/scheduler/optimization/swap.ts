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




/**
 * Result of testing one possible employee swap.
 */
export type SwapCheck = {
  allowed: boolean

  firstCheck?: AssignmentCheck

  secondCheck?: AssignmentCheck
}


/**
 * Find one generated block belonging to a shift.
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
 * Find an employee safely.
 */
function findEmployee(
  employeeId: number,
  context: SchedulerContext,
): Employee | undefined {
  return context.employees.find(
    employee =>
      employee.id === employeeId,
  )
}


/**
 * Create a temporary context.
 *
 * IMPORTANT:
 *
 * We do NOT mutate the real scheduler here.
 *
 * canAssign() will simply see this temporary
 * working schedule as though it were real.
 */
function createTemporaryContext(
  context: SchedulerContext,
  workingShifts: Shift[],
): SchedulerContext {
  return {
    ...context,

    workingShifts,
  }
}


/**
 * Build the ShiftBlockState corresponding to one target shift.
 *
 * Existing assignments are seeded into it so:
 *
 * - role capacity
 * - duplicate employee
 * - pair feasibility
 *
 * are checked exactly like normal generation.
 */
function buildStateForShift(
  shift: Shift,
  blocks: ShiftBlock[],
  workingShifts: Shift[],
  context: SchedulerContext,
) {
  const block =
    findBlockForShift(
      shift,
      blocks,
    )

  if (!block) {
    return null
  }


  let state =
    createShiftBlockState(
      block,
    )


  state =
    seedExistingAssignments(
      state,
      workingShifts,
      context.employees,
    )


  return state
}


/**
 * Test:
 *
 * Employee from shift A -> shift B
 * Employee from shift B -> shift A
 *
 *
 * IMPORTANT:
 *
 * We remove BOTH original generated assignments first.
 *
 * Otherwise canAssign() would think:
 *
 * "that role is already occupied"
 *
 * or:
 *
 * "this employee already works that slot"
 *
 * even though we're trying to replace the old assignments.
 */
export function canSwapGeneratedShifts(
  firstShift: Shift,
  secondShift: Shift,
  blocks: ShiftBlock[],
  context: SchedulerContext,
): SwapCheck {

  // ---------------------------------------------------------
  // Basic sanity checks
  // ---------------------------------------------------------

  if (
    firstShift.id === secondShift.id ||
    firstShift.employeeId === null ||
    secondShift.employeeId === null ||
    firstShift.employeeId === secondShift.employeeId
  ) {
    return {
      allowed: false,
    }
  }


  /**
   * Only generated shifts may move.
   *
   * Manual / DB / locked shifts never appear in this list.
   */
  const firstIsGenerated =
    context.generatedShifts.some(
      shift =>
        shift.id === firstShift.id,
    )

  const secondIsGenerated =
    context.generatedShifts.some(
      shift =>
        shift.id === secondShift.id,
    )


  if (
    !firstIsGenerated ||
    !secondIsGenerated
  ) {
    return {
      allowed: false,
    }
  }

  const firstIsMandatory =
  context.mandatoryGeneratedShiftIds.has(
    firstShift.id,
  )

  const secondIsMandatory =
    context.mandatoryGeneratedShiftIds.has(
      secondShift.id,
    )


  if (
    firstIsMandatory ||
    secondIsMandatory
  ) {
    return {
      allowed: false,
    }
  }

  const firstEmployee =
    findEmployee(
      firstShift.employeeId,
      context,
    )

  const secondEmployee =
    findEmployee(
      secondShift.employeeId,
      context,
    )


  if (
    !firstEmployee ||
    !secondEmployee
  ) {
    return {
      allowed: false,
    }
  }


  // ---------------------------------------------------------
  // Remove the two old assignments.
  // ---------------------------------------------------------

  const baseWorkingShifts =
    context.workingShifts.filter(
      shift =>
        shift.id !== firstShift.id &&
        shift.id !== secondShift.id,
    )


  // =========================================================
  // CHECK 1
  //
  // First employee -> second employee's shift
  // =========================================================

  const secondBlockState =
    buildStateForShift(
      secondShift,
      blocks,
      baseWorkingShifts,
      context,
    )


  if (!secondBlockState) {
    return {
      allowed: false,
    }
  }


  const firstTemporaryContext =
    createTemporaryContext(
      context,
      baseWorkingShifts,
    )


  const firstRuleContext =
    createAssignmentRuleContext(
      firstTemporaryContext,
      secondBlockState,
    )


  const firstCheck =
    canAssign(
      firstEmployee,

      {
        locationId:
          secondShift.locationId,

        roleId:
          secondShift.roleId!,

        categoryId:
          secondShift.categoryId,

        date:
          secondShift.date,
      },

      firstRuleContext,
    )


  if (!firstCheck.allowed) {
    return {
      allowed: false,
      firstCheck,
    }
  }


  /**
   * Simulate the first half of the swap.
   */
  const simulatedFirstShift: Shift = {
    ...secondShift,

    employeeId:
      firstEmployee.id,
  }


  const afterFirstSwap = [
    ...baseWorkingShifts,
    simulatedFirstShift,
  ]


  // =========================================================
  // CHECK 2
  //
  // Second employee -> first employee's shift
  // =========================================================

  const firstBlockState =
    buildStateForShift(
      firstShift,
      blocks,
      afterFirstSwap,
      context,
    )


  if (!firstBlockState) {
    return {
      allowed: false,
      firstCheck,
    }
  }


  const secondTemporaryContext =
    createTemporaryContext(
      context,
      afterFirstSwap,
    )


  const secondRuleContext =
    createAssignmentRuleContext(
      secondTemporaryContext,
      firstBlockState,
    )


  const secondCheck =
    canAssign(
      secondEmployee,

      {
        locationId:
          firstShift.locationId,

        roleId:
          firstShift.roleId!,

        categoryId:
          firstShift.categoryId,

        date:
          firstShift.date,
      },

      secondRuleContext,
    )


  if (!secondCheck.allowed) {
    return {
      allowed: false,
      firstCheck,
      secondCheck,
    }
  }

  // =========================================================
  // FINAL FATIGUE AUDIT
  //
  // canAssign() is mainly incremental.
  // A swap can move work backward in time, so we must
  // validate the COMPLETE resulting streak.
  // =========================================================

  const simulatedSecondShift: Shift = {
    ...firstShift,

    employeeId:
      secondEmployee.id,
  }


  const finalSimulatedSchedule = [
    ...afterFirstSwap,
    simulatedSecondShift,
  ]

    // =========================================================
    // FINAL FATIGUE AUDIT
    //
    // canAssign() validates each replacement incrementally,
    // but a swap can move work backward or forward in time.
    //
    // Validate the COMPLETE final schedule for both employees.
    // =========================================================

    const firstEmployeeFatigueViolation =
      hasFatigueViolationAroundDate(
        firstEmployee.id,
        secondShift.date,
        finalSimulatedSchedule,
        context.categories,
      )

    const secondEmployeeFatigueViolation =
      hasFatigueViolationAroundDate(
        secondEmployee.id,
        firstShift.date,
        finalSimulatedSchedule,
        context.categories,
      )

    if (
      firstEmployeeFatigueViolation ||
      secondEmployeeFatigueViolation
    ) {
      return {
        allowed: false,
        firstCheck,
        secondCheck,
      }
    }


  return {
    allowed: true,
    firstCheck,
    secondCheck,
  }
}


/**
 * Actually perform an already-approved swap.
 *
 * We only change employeeId.
 *
 * Date / category / location / role stay attached
 * to their original shift slots.
 */
export function applyGeneratedShiftSwap(
  firstShift: Shift,
  secondShift: Shift,
  context: SchedulerContext,
): void {

  if (
    firstShift.employeeId === null ||
    secondShift.employeeId === null
  ) {
    return
  }


  const firstEmployeeId =
    firstShift.employeeId

  const secondEmployeeId =
    secondShift.employeeId


  /**
   * generatedShifts and workingShifts currently share
   * the same generated Shift objects.
   *
   * Still, updating by ID makes the intention explicit.
   */
  for (
    const shift of
    context.generatedShifts
  ) {
    if (
      shift.id === firstShift.id
    ) {
      shift.employeeId =
        secondEmployeeId
    }

    if (
      shift.id === secondShift.id
    ) {
      shift.employeeId =
        firstEmployeeId
    }
  }


  for (
    const shift of
    context.workingShifts
  ) {
    if (
      shift.id === firstShift.id
    ) {
      shift.employeeId =
        secondEmployeeId
    }

    if (
      shift.id === secondShift.id
    ) {
      shift.employeeId =
        firstEmployeeId
    }
  }
}