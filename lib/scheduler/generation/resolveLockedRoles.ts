import type {
  Shift,
} from '@/lib/types'

import type {
  ShiftBlockState,
} from '../types'

import type {
  SchedulerContext,
} from '../context'

import {
  createAssignmentRuleContext,
} from '../context'

import {
  tryAssign,
} from './assign'

import {
  getRemainingCount,
} from './blockState'

import type {
  AssignmentRequirement,
} from '../rules/canAssign'


/**
 * One manual/locked shift whose role was chosen
 * by the scheduler.
 *
 * We return this information so the frontend can update
 * its original manual shift from:
 *
 *   roleId: null
 *
 * to:
 *
 *   roleId: chosen role
 */
export type ResolvedLockedRole = {
  shiftId: number
  roleId: number
}


/**
 * Result for one ShiftBlock.
 */
export type ResolveLockedRolesResult = {
  state: ShiftBlockState

  resolved: ResolvedLockedRole[]

  /**
   * Normally this should be empty.
   *
   * If it isn't, the employee was locked into this shift
   * but we could not legally give them any required role.
   */
  unresolvedShiftIds: number[]
}


/**
 * Is this roleless locked shift part of THIS block?
 *
 * Block identity is:
 *
 * date + location + category
 */
function belongsToBlock(
  shift: Shift,
  state: ShiftBlockState,
): boolean {
  return (
    shift.date === state.date &&
    shift.locationId === state.locationId &&
    shift.categoryId === state.categoryId
  )
}


/**
 * Temporarily hide the locked shift that we're resolving.
 *
 * Why?
 *
 * Imagine Alice is already manually stored as:
 *
 * Alice / Morning / role=null
 *
 * If we call canAssign(Alice, Morning Member)
 * while that original shift is still visible,
 * canAssign() may think:
 *
 * "Alice already works Morning"
 *
 * and reject Alice from her OWN locked shift.
 *
 * So during the role test only:
 *
 * remove Alice's old placeholder
 * -> test role
 * -> put it back with the chosen role
 */
function createContextWithoutShift(
  context: SchedulerContext,
  shiftId: number,
): SchedulerContext {
  return {
    ...context,

    workingShifts:
      context.workingShifts.filter(
        shift =>
          shift.id !== shiftId,
      ),

    lockedShifts:
      context.lockedShifts.filter(
        shift =>
          shift.id !== shiftId,
      ),
  }
}


/**
 * Once a role is chosen, update the EXISTING locked shift.
 *
 * IMPORTANT:
 *
 * We are NOT creating a generated shift here.
 *
 * Employee/date/category/location remain exactly the same.
 * Only roleId is filled in.
 */
function applyResolvedRole(
  context: SchedulerContext,
  shiftId: number,
  roleId: number,
): void {

  for (
    const shift of
    context.workingShifts
  ) {
    if (shift.id === shiftId) {
      shift.roleId = roleId
    }
  }


  for (
    const shift of
    context.lockedShifts
  ) {
    if (shift.id === shiftId) {
      shift.roleId = roleId
    }
  }
}


/**
 * Resolve locked/manual shifts that already have:
 *
 * employee ✅
 * date ✅
 * category ✅
 * location ✅
 *
 * but:
 *
 * role ❓
 *
 *
 * The scheduler may decide ONLY the role.
 * It may not move the employee anywhere.
 */
export function resolveLockedRolesToBlock(
  initialState: ShiftBlockState,
  context: SchedulerContext,
): ResolveLockedRolesResult {

  let state =
    initialState


  const resolved:
    ResolvedLockedRole[] = []

  const unresolvedShiftIds:
    number[] = []


  // =========================================================
  // Find roleless locked shifts belonging to this block
  // =========================================================

  const rolelessLockedShifts =
    context.lockedShifts.filter(
      shift =>
        belongsToBlock(
          shift,
          state,
        ) &&
        shift.employeeId !== null &&
        shift.roleId === null,
    )


  // =========================================================
  // Resolve them one at a time
  // =========================================================

  for (
    const lockedShift of
    rolelessLockedShifts
  ) {

    /**
     * TypeScript now knows this isn't null because of
     * our filter logically, but filter narrowing may not
     * survive depending on your Shift type.
     */
    if (
      lockedShift.employeeId === null
    ) {
      continue
    }


    const employee =
      context.employees.find(
        employee =>
          employee.id ===
          lockedShift.employeeId,
      )


    if (!employee) {
      unresolvedShiftIds.push(
        lockedShift.id,
      )

      continue
    }


    let roleWasResolved =
      false


    // =======================================================
    // Try every role required by this block
    // =======================================================

    for (
      const roleRequirement
      of state.requirements
    ) {

      /**
       * Do not put Alice into a role that is already full.
       */
      const remaining =
        getRemainingCount(
          state,
          roleRequirement.roleId,
        )


      if (remaining <= 0) {
        continue
      }


      const requirement:
        AssignmentRequirement = {

        date:
          state.date,

        locationId:
          state.locationId,

        categoryId:
          state.categoryId,

        roleId:
          roleRequirement.roleId,
      }


      // =====================================================
      // Hide Alice's original roleless shift while testing
      // =====================================================

      const temporaryContext =
        createContextWithoutShift(
          context,
          lockedShift.id,
        )


      const ruleContext =
        createAssignmentRuleContext(
          temporaryContext,
          state,
        )


      // =====================================================
      // Use the NORMAL hard-rule system
      // =====================================================

      const result =
        tryAssign(
          employee,
          requirement,
          ruleContext,
        )


      /**
       * Maybe Alice cannot be In Charge.
       *
       * That's fine.
       *
       * Try Member next.
       */
      if (!result.success) {
        continue
      }


      // =====================================================
      // This role works
      // =====================================================

      state =
        result.state


      applyResolvedRole(
        context,
        lockedShift.id,
        roleRequirement.roleId,
      )


      resolved.push({
        shiftId:
          lockedShift.id,

        roleId:
          roleRequirement.roleId,
      })


      roleWasResolved =
        true


      /**
       * One locked shift gets exactly ONE role.
       */
      break
    }


    if (!roleWasResolved) {
      unresolvedShiftIds.push(
        lockedShift.id,
      )
    }
  }


  return {
    state,
    resolved,
    unresolvedShiftIds,
  }
}