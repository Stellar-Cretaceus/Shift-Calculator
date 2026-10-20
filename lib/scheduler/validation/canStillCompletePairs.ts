import type { Employee, EmployeeTitle } from '@/lib/types'

import type {
  BlockAssignment,
  ShiftBlockState,
} from '../types'

import {
  findCompatiblePairs,
} from './validatePairs'

import {
  getRemainingCount,
  simulateAssignment,
} from '../generation/blockState'

/**
 * We only need these Employee properties for this check.
 */
export type PairCandidate = Pick<
  Employee,
  'id' | 'titleId' | 'roleIds'
>

/**
 * Tells the pairing rule which roles form a pair.
 *
 * In your current system:
 *
 *   In Charge + Member
 *
 * We pass the IDs instead of hardcoding 5 and 6.
 */
export type PairRoleConfig = {
  inChargeRoleId: number
  memberRoleId: number
}

type PairCompletionInput = {
  block: ShiftBlockState

  /**
   * The employee we are THINKING about assigning.
   * This assignment has not been committed yet.
   */
  proposedAssignment: BlockAssignment

  /**
   * Employees who could potentially still be used
   * for this block.
   */
  candidates: PairCandidate[]

  titles: EmployeeTitle[]

  pairRoles: PairRoleConfig
}

/**
 * Check whether making one proposed assignment still leaves
 * at least one possible complete compatible pairing.
 *
 * This is our first "look ahead" rule.
 */
export function canStillCompletePairs({
  block,
  proposedAssignment,
  candidates,
  titles,
  pairRoles,
}: PairCompletionInput): boolean {
  /**
   * First simulate the proposed assignment.
   *
   * Nothing is actually committed.
   */
  const simulated = simulateAssignment(
    block,
    proposedAssignment,
  )

  const {
    inChargeRoleId,
    memberRoleId,
  } = pairRoles

  /**
   * Get people already assigned to each side.
   */
  const assignedInCharges = simulated.assignments
    .filter(
      assignment =>
        assignment.roleId === inChargeRoleId,
    )
    .map(assignment => ({
      employeeId: assignment.employeeId,
      titleId: assignment.titleId,
    }))

  const assignedMembers = simulated.assignments
    .filter(
      assignment =>
        assignment.roleId === memberRoleId,
    )
    .map(assignment => ({
      employeeId: assignment.employeeId,
      titleId: assignment.titleId,
    }))

  const remainingInChargeSlots =
    getRemainingCount(
      simulated,
      inChargeRoleId,
    )

  const remainingMemberSlots =
    getRemainingCount(
      simulated,
      memberRoleId,
    )

  /**
   * Employees already used by this block
   * cannot be used again.
   */
  const usedEmployeeIds = new Set(
    simulated.assignments.map(
      assignment => assignment.employeeId,
    ),
  )

  /**
   * Candidate In Charges who:
   *
   * - have not already been used
   * - are allowed to work the In Charge role
   */
  const possibleInCharges = candidates
    .filter(
      employee =>
        !usedEmployeeIds.has(employee.id) &&
        employee.roleIds.includes(inChargeRoleId),
    )
    .map(employee => ({
      employeeId: employee.id,
      titleId: employee.titleId,
    }))

  /**
   * Same idea for Members.
   */
  const possibleMembers = candidates
    .filter(
      employee =>
        !usedEmployeeIds.has(employee.id) &&
        employee.roleIds.includes(memberRoleId),
    )
    .map(employee => ({
      employeeId: employee.id,
      titleId: employee.titleId,
    }))

  /**
   * Quick failure:
   *
   * If we need two more In Charges,
   * but only one possible employee exists,
   * completion is impossible.
   */
  if (
    possibleInCharges.length <
    remainingInChargeSlots
  ) {
    return false
  }

  if (
    possibleMembers.length <
    remainingMemberSlots
  ) {
    return false
  }

  /**
   * Now we need to know whether SOME choice of the
   * remaining candidates can complete the whole block.
   *
   * Because the blocks are small, simple recursive
   * combination searching is perfectly reasonable.
   */
  return searchCompletions(
    assignedInCharges,
    assignedMembers,
    possibleInCharges,
    possibleMembers,
    remainingInChargeSlots,
    remainingMemberSlots,
    titles,
  )
}

/**
 * Try different combinations of remaining candidates.
 *
 * We don't care WHICH completion is best yet.
 *
 * We only ask:
 *
 *   "Does at least one legal completion exist?"
 */
function searchCompletions(
  assignedInCharges: {
    employeeId: number
    titleId: number | null
  }[],

  assignedMembers: {
    employeeId: number
    titleId: number | null
  }[],

  possibleInCharges: {
    employeeId: number
    titleId: number | null
  }[],

  possibleMembers: {
    employeeId: number
    titleId: number | null
  }[],

  remainingInChargeSlots: number,
  remainingMemberSlots: number,

  titles: EmployeeTitle[],
): boolean {
  /**
   * Generate all possible choices for the remaining
   * In Charge slots.
   */
  const inChargeChoices = combinations(
    possibleInCharges,
    remainingInChargeSlots,
  )

  const memberChoices = combinations(
    possibleMembers,
    remainingMemberSlots,
  )

  for (const extraInCharges of inChargeChoices) {
    for (const extraMembers of memberChoices) {
      /**
       * Make sure one employee wasn't selected as both
       * In Charge AND Member.
       */
      const inChargeIds = new Set(
        extraInCharges.map(person => person.employeeId),
      )

      const duplicateEmployee =
        extraMembers.some(person =>
          inChargeIds.has(person.employeeId),
        )

      if (duplicateEmployee) {
        continue
      }

      const allInCharges = [
        ...assignedInCharges,
        ...extraInCharges,
      ]

      const allMembers = [
        ...assignedMembers,
        ...extraMembers,
      ]

      /**
       * We already wrote this!
       *
       * Ask whether this completed group can be
       * matched into compatible pairs.
       */
      const pairs = findCompatiblePairs(
        allInCharges,
        allMembers,
        titles,
      )

      if (pairs !== null) {
        return true
      }
    }
  }

  return false
}

/**
 * Return every possible selection of `count` items.
 *
 * Example:
 *
 * items = [A, B, C]
 * count = 2
 *
 * result:
 *
 * [
 *   [A, B],
 *   [A, C],
 *   [B, C],
 * ]
 */
function combinations<T>(
  items: T[],
  count: number,
): T[][] {
  if (count === 0) {
    return [[]]
  }

  if (items.length < count) {
    return []
  }

  const result: T[][] = []

  function search(
    startIndex: number,
    current: T[],
  ) {
    if (current.length === count) {
      result.push([...current])
      return
    }

    for (
      let i = startIndex;
      i < items.length;
      i++
    ) {
      current.push(items[i])

      search(
        i + 1,
        current,
      )

      current.pop()
    }
  }

  search(0, [])

  return result
}