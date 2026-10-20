import type { Employee } from '@/lib/types'

import type {
  ShiftBlockState,
} from '../types'

import type {
  AssignmentRequirement,
  AssignmentRuleContext,
  AssignmentCheck,
} from '../rules/canAssign'

import {
  canAssign,
} from '../rules/canAssign'

import {
  simulateAssignment,
} from './blockState'



/**
 * Result returned when we try to actually assign
 * an employee into a ShiftBlock.
 *
 * If success = true:
 *   state contains the NEW ShiftBlockState.
 *
 * If success = false:
 *   the original state is returned unchanged,
 *   together with the reasons from canAssign().
 */
export type AssignResult = {
  success: boolean

  state: ShiftBlockState

  check: AssignmentCheck
}


/**
 * Try to assign one employee to one requirement.
 *
 * This function does TWO things:
 *
 * 1. Ask canAssign() whether the assignment is legal.
 * 2. If legal, create a new ShiftBlockState containing
 *    that assignment.
 *
 *
 * IMPORTANT:
 *
 * This does NOT modify the original block.
 *
 * Example:
 *
 * oldState
 *   ↓
 * tryAssign(...)
 *   ↓
 * newState
 *
 * oldState remains unchanged.
 */
export function tryAssign(
  employee: Employee,
  requirement: AssignmentRequirement,
  context: AssignmentRuleContext,
): AssignResult {
  // ---------------------------------------------------------
  // Step 1:
  // Ask the central hard-rule checker.
  // ---------------------------------------------------------

  const check = canAssign(
    employee,
    requirement,
    context,
  )


  // ---------------------------------------------------------
  // Step 2:
  // If any hard rule failed, do NOT change the block.
  // ---------------------------------------------------------

  if (!check.allowed) {
    return {
      success: false,

      // Return the exact same current state.
      state: context.block,

      check,
    }
  }


  // ---------------------------------------------------------
  // Step 3:
  // The employee passed every hard rule.
  //
  // Create a NEW block state containing the assignment.
  // ---------------------------------------------------------

  const newState = simulateAssignment(
    context.block,
    {
      employeeId: employee.id,
      titleId: employee.titleId,
      roleId: requirement.roleId,
    },
  )


  return {
    success: true,
    state: newState,
    check,
  }
}