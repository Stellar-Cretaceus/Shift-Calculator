import type {
  BlockAssignment,
  ShiftBlock,
  ShiftBlockState,
  
} from '../types'

import type {
  Employee,
  Shift,
} from '@/lib/types'

/**
 * Create an empty working state from a ShiftBlock.
 *
 * The block describes what we NEED.
 * The state describes what we currently HAVE.
 */
export function createShiftBlockState(
  block: ShiftBlock,
): ShiftBlockState {
  return {
    ...block,
    assignments: [],
  }
}





/**
 * Count how many people have already been assigned
 * to a particular role.
 */
export function countAssignedToRole(
  block: ShiftBlockState,
  roleId: number,
): number {
  return block.assignments.filter(
    assignment => assignment.roleId === roleId,
  ).length
}

/**
 * Find how many slots are still empty for a role.
 */
export function getRemainingCount(
  block: ShiftBlockState,
  roleId: number,
): number {
  const requirement = block.requirements.find(
    requirement => requirement.roleId === roleId,
  )

  if (!requirement) {
    return 0
  }

  const alreadyAssigned = countAssignedToRole(
    block,
    roleId,
  )

  return Math.max(
    0,
    requirement.requiredCount - alreadyAssigned,
  )
}

/**
 * Returns true when this role still has room
 * for another employee.
 */
export function hasOpenRoleSlot(
  block: ShiftBlockState,
  roleId: number,
): boolean {
  return getRemainingCount(block, roleId) > 0
}





/**
 * Check whether an employee is already inside this block.
 *
 * An employee should never occupy two roles
 * in the same Morning/Noon/Night block.
 */
export function isEmployeeAlreadyAssigned(
  block: ShiftBlockState,
  employeeId: number,
): boolean {
  return block.assignments.some(
    assignment =>
      assignment.employeeId === employeeId,
  )
}

/**
 * Insert existing/pre-generated shifts into a block state.
 *
 * These assignments already existed before generation
 * started, so they must consume requirement slots.
 *
 * Example:
 *
 * template requires:
 *   2 In Charge
 *   2 Member
 *
 * existing shifts contain:
 *   1 In Charge
 *
 * resulting block state should report:
 *   1 In Charge remaining
 *   2 Member remaining
 */
export function seedExistingAssignments(
  state: ShiftBlockState,
  shifts: Shift[],
  employees: Employee[],
): ShiftBlockState {

  let nextState =
    state


  const matchingShifts =
    shifts.filter(
      shift =>
        shift.date === state.date &&
        shift.locationId === state.locationId &&
        shift.categoryId === state.categoryId &&
        shift.roleId !== null &&
        shift.employeeId !== null,
    )

  for (const shift of matchingShifts) {

    /**
     * TypeScript does not reliably remember the null checks
     * from matchingShifts.filter(), so narrow them again here.
     */
    if (
      shift.employeeId === null ||
      shift.roleId === null
    ) {
      continue
    }


    const employee =
      employees.find(
        employee =>
          employee.id === shift.employeeId,
      )


    /**
     * BlockAssignment requires a real numeric titleId.
     */
    if (
      !employee ||
      employee.titleId === null
    ) {
      continue
    }


    const roleExists =
      nextState.requirements.some(
        requirement =>
          requirement.roleId === shift.roleId,
      )


    if (!roleExists) {
      continue
    }


    const alreadyPresent =
      nextState.assignments.some(
        assignment =>
          assignment.employeeId ===
          employee.id,
      )


    if (alreadyPresent) {
      continue
    }


    nextState = {
      ...nextState,

      assignments: [
        ...nextState.assignments,

        {
          employeeId:
            employee.id,

          titleId:
            employee.titleId,

          roleId:
            shift.roleId,
        },
      ],
    }
  }


  return nextState
}


/**
 * Return a NEW block state containing the proposed assignment.
 *
 * We intentionally do not modify the old state.
 *
 * This makes it safe to simulate:
 *
 *   "What would happen IF we assign this employee?"
 *
 * without actually committing the decision.
 */
export function simulateAssignment(
  block: ShiftBlockState,
  assignment: BlockAssignment,
): ShiftBlockState {
  return {
    ...block,

    assignments: [
      ...block.assignments,
      assignment,
    ],
  }
}