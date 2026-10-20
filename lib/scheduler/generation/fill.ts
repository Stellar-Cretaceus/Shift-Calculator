import type {
  Employee,
} from '@/lib/types'

import type {
  ShiftBlockState,
} from '../types'

import {
  getRemainingCount,
} from './blockState'

import {
  tryAssign,
} from './assign'

import {
  canAssign,
  type AssignmentRequirement,
} from '../rules/canAssign'

import type {
  SchedulerContext,
} from '../context'

import {
  addGeneratedShift,
  createAssignmentRuleContext,
} from '../context'


import {
  scoreCandidate,
} from '../scoring/candidate-score'

import type {
  NormalTimeOfDay,
} from '../scoring/category-balance'

import {
  randomInt,
} from '../random'

/**
 * Everything fill.ts needs.
 *
 * Just like mandatory.ts, the block itself is passed
 * separately because it changes after every assignment.
 */



/**
 * Result after trying to fill all remaining slots
 * in one ShiftBlock.
 */
export type FillResult = {
  /**
   * Final block state after filling.
   */
  state: ShiftBlockState

  /**
   * Employees successfully assigned during THIS pass.
   */
  assignedEmployeeIds: number[]

  /**
   * Number of role slots that could not be filled.
   *
   * This is NOT an error.
   *
   * Our rule is:
   *
   * legal blank slot
   *     >
   * illegal assignment
   */
  unfilledCount: number
}


/**
 * Convert a role requirement inside a block into the
 * AssignmentRequirement format expected by canAssign().
 */
function createRequirement(
  block: ShiftBlockState,
  roleId: number,
): AssignmentRequirement {
  return {
    date: block.date,
    locationId: block.locationId,
    categoryId: block.categoryId,
    roleId,
  }
}

/**
 * Find the Morning / Noon / Night bucket
 * belonging to this block.
 */
function getBlockTimeOfDay(
  block: ShiftBlockState,
  context: SchedulerContext,
): NormalTimeOfDay | null {
  const category =
    context.categories.find(
      category =>
        category.id === block.categoryId,
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


type ScoredCandidate = {
  employee: Employee
  totalScore: number
}


/**
 * Find legal employees and rank them.
 *
 * IMPORTANT:
 *
 * We do this again after EVERY assignment because
 * the block state and eventually the live schedule change.
 */
function getBestCandidate(
  state: ShiftBlockState,
  roleId: number,
  context: SchedulerContext,
): Employee | null {
  const timeOfDay =
    getBlockTimeOfDay(
      state,
      context,
    )

  /**
   * Automatic generation should only contain
   * Morning / Noon / Night categories.
   */
  if (!timeOfDay) {
    return null
  }

  const requirement =
    createRequirement(
      state,
      roleId,
    )

  const ruleContext =
  createAssignmentRuleContext(
    context,
    state,
  )


  // =========================================================
  // STEP 1 — Keep only LEGAL candidates
  // =========================================================

  const scoredCandidates: ScoredCandidate[] = []

  for (const employee of context.employees) {
    const check =
      canAssign(
        employee,
        requirement,
        ruleContext,
      )

    if (!check.allowed) {
      continue
    }


    // =======================================================
    // STEP 2 — Score legal candidate
    // =======================================================

    const score =
      scoreCandidate(
        employee,
        {
          shifts:
            context.workingShifts,

          categories:
            context.categories,

          timeOfDay,

          date:
            state.date,
        },
      )


    scoredCandidates.push({
      employee,
      totalScore:
        score.totalScore,
    })
  }


  if (scoredCandidates.length === 0) {
    return null
  }


  // =========================================================
  // STEP 3 — Find lowest score
  // =========================================================

  const bestScore =
    Math.min(
      ...scoredCandidates.map(
        candidate =>
          candidate.totalScore,
      ),
    )


  // =========================================================
  // STEP 4 — Collect exact ties
  // =========================================================

  const bestCandidates =
    scoredCandidates.filter(
      candidate =>
        candidate.totalScore ===
        bestScore,
    )


  // =========================================================
  // STEP 5 — Seeded random tie-break
  // =========================================================

  const winnerIndex =
    randomInt(
      context.random,
      bestCandidates.length,
    )


  return (
    bestCandidates[
      winnerIndex
    ].employee
  )
}




export function fillRemainingSlots(
  initialState: ShiftBlockState,
  context: SchedulerContext,
): FillResult {
  let state = initialState

  const assignedEmployeeIds: number[] = []


  // =========================================================
  // Visit every role requirement
  // =========================================================

  for (
    const roleRequirement
    of state.requirements
  ) {
    let remainingCount =
      getRemainingCount(
        state,
        roleRequirement.roleId,
      )


    while (remainingCount > 0) {

      // =====================================================
      // Pick best currently legal candidate
      // =====================================================

      const employee =
        getBestCandidate(
          state,
          roleRequirement.roleId,
          context,
        )


      /**
       * Nobody can legally fill this slot.
       *
       * Leave it blank rather than breaking rules.
       */
      if (!employee) {
        break
      }


      const requirement =
        createRequirement(
          state,
          roleRequirement.roleId,
        )


      const assignmentContext =
      createAssignmentRuleContext(
        context,
        state,
      )


      // =====================================================
      // Commit selected candidate
      // =====================================================

      const result =
        tryAssign(
          employee,
          requirement,
          assignmentContext,
        )


      /**
       * This should normally succeed because we already
       * checked canAssign() while selecting the candidate.
       *
       * Still keep this guard for safety.
       */
      if (!result.success) {
        break
      }


      state =
        result.state

      addGeneratedShift(
      context,
      {
        employeeId:
          employee.id,

        locationId:
          requirement.locationId,

        roleId:
          requirement.roleId,

        categoryId:
          requirement.categoryId,

        date:
          requirement.date,
      },
    )


      assignedEmployeeIds.push(
        employee.id,
      )


      // =====================================================
      // Recalculate before picking the next employee
      // =====================================================

      remainingCount =
        getRemainingCount(
          state,
          roleRequirement.roleId,
        )
    }
  }


  let unfilledCount = 0

  for (
    const requirement
    of state.requirements
  ) {
    unfilledCount +=
      getRemainingCount(
        state,
        requirement.roleId,
      )
  }


  return {
    state,
    assignedEmployeeIds,
    unfilledCount,
  }
}