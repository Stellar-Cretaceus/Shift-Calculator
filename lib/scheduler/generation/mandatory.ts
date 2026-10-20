
import type {
  Employee,
  EmployeeTitle,
} from '@/lib/types'

import type {
  ShiftBlockState,
} from '../types'

import {
  findTitle,
} from '../rules/compatibility'

import {
  isMandatoryWorkDate,
} from '../rules/availability'

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
 * Result of running the mandatory pass
 * for one ShiftBlock.
 */
export type MandatoryAssignmentResult = {
  /**
   * Updated state after all possible mandatory
   * assignments have been attempted.
   */
  state: ShiftBlockState

  /**
   * IDs of employees successfully assigned
   * during this mandatory pass.
   *
   * Useful later for debugging.
   */
  assignedEmployeeIds: number[]
}


/**
 * Check whether an employee belongs to a Title/Rank
 * that MUST work whenever they are available.
 */
function isMandatoryEmployeeOnDate(
  employee: Employee,
  titles: EmployeeTitle[],
  date: string,
  holidayDates: Set<string>,
): boolean {
  const title = findTitle(
    titles,
    employee.titleId,
  )

  if (!title) {
    return false
  }

  const isHoliday =
    holidayDates.has(date)

  return isMandatoryWorkDate(
    title,
    date,
    isHoliday,
  )
}


/**
 * Build one AssignmentRequirement from a ShiftBlock.
 *
 * The roleId changes depending on which role we're
 * currently trying to fill.
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

type ScoredMandatoryCandidate = {
  employee: Employee
  totalScore: number
}


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


function getBestMandatoryCandidate(
  state: ShiftBlockState,
  roleId: number,
  context: SchedulerContext,
): Employee | null {
  const timeOfDay =
    getBlockTimeOfDay(
      state,
      context,
    )

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


  const scoredCandidates:
    ScoredMandatoryCandidate[] = []


  for (const employee of context.employees) {

    // =======================================================
    // Must actually be mandatory TODAY
    // =======================================================

    if (
      !isMandatoryEmployeeOnDate(
        employee,
        context.titles,
        state.date,
        context.holidayDates,
      )
    ) {
      continue
    }


    // =======================================================
    // Hard rules
    // =======================================================

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
    // Soft score
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


  if (
    scoredCandidates.length === 0
  ) {
    return null
  }


  const bestScore =
    Math.min(
      ...scoredCandidates.map(
        candidate =>
          candidate.totalScore,
      ),
    )


  const bestCandidates =
    scoredCandidates.filter(
      candidate =>
        candidate.totalScore ===
        bestScore,
    )


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




export function assignMandatoryToBlock(
  initialState: ShiftBlockState,
  context: SchedulerContext,
): MandatoryAssignmentResult {
  let state =
    initialState

  const assignedEmployeeIds:
    number[] = []


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
      // Pick best legal mandatory employee
      // =====================================================

      const employee =
        getBestMandatoryCandidate(
          state,
          roleRequirement.roleId,
          context,
        )


      /**
       * No mandatory employee can legally take
       * this particular slot.
       *
       * That's fine — fill.ts can handle it later.
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


      const result =
        tryAssign(
          employee,
          requirement,
          assignmentContext,
        )


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

            mandatory: true
        },
      )

      assignedEmployeeIds.push(
        employee.id,
      )


      remainingCount =
        getRemainingCount(
          state,
          roleRequirement.roleId,
        )
    }
  }


  return {
    state,
    assignedEmployeeIds,
  }
}
