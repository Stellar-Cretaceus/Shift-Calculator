
import type {
  Employee,
  EmployeeTitle,
  Shift,
  ShiftCategory,
} from '@/lib/types'

import type {
  ShiftBlockState,
} from './types'

import type {
  AssignmentRuleContext,
} from './rules/canAssign'

import type {
  PairCandidate,
  PairRoleConfig,
} from './validation/canStillCompletePairs'


/**
 * Input needed to create one scheduler run.
 *
 * This is mostly data coming from:
 *
 * - DB
 * - schedule.ts
 * - generateSchedule.ts
 */
export type CreateSchedulerContextInput = {
  employees: Employee[]

  titles: EmployeeTitle[]

  categories: ShiftCategory[]

  /**
   * Existing shifts already known before generation starts.
   *
   * Examples:
   *
   * - manually created shifts
   * - Vacation
   * - OFF
   * - Special shifts
   * - normal locked shifts
   *
   * These become the starting contents of workingShifts.
   */
  existingShifts: Shift[]

  /**
   * Strictly immutable shifts.
   *
   * Usually this is a subset of existingShifts.
   *
   * Fatigue lookahead uses this because these shifts
   * cannot be removed later.
   */
  lockedShifts: Shift[]

  holidayDates: Set<string>

  pairRoles: PairRoleConfig

  /**
   * One seeded random generator for the ENTIRE run.
   */
  random: () => number

  /**
   * Seed is stored mainly for debugging/logging.
   */
  seed: number
}


/**
 * Mutable state for ONE schedule-generation run.
 *
 * ---------------------------------------------------------
 * IMPORTANT DESIGN DECISION
 * ---------------------------------------------------------
 *
 * Most of our smaller modules are pure functions.
 *
 * SchedulerContext is intentionally different:
 *
 * it is the one place allowed to maintain the changing
 * global schedule while generation is happening.
 *
 * This avoids having separate copies of "current schedule"
 * drifting out of sync.
 */
export type SchedulerContext = {
  employees: Employee[]

  titles: EmployeeTitle[]

  categories: ShiftCategory[]

  holidayDates: Set<string>

  pairRoles: PairRoleConfig

  /**
   * Candidates used by pair-feasibility lookahead.
   */
  candidates: PairCandidate[]

  /**
   * Immutable original/manual shifts.
   */
  lockedShifts: Shift[]

  /**
   * THE IMPORTANT ONE.
   *
   * Complete schedule currently known to the generator.
   *
   * Initially:
   *
   * workingShifts = existingShifts
   *
   * Then every generated assignment gets appended.
   *
   * Therefore:
   *
   * fatigue.ts
   * workload.ts
   * category-balance.ts
   * daily-combination.ts
   * sequence.ts
   *
   * can all see newly generated work.
   */
  workingShifts: Shift[]

  /**
   * Only shifts created during THIS generation run.
   *
   * Useful later when generateSchedule() needs to return
   * the newly generated schedule.
   */
  generatedShifts: Shift[]

  random: () => number

  seed: number

  /**
   * Temporary IDs for generated shifts.
   *
   * We use negative numbers so they cannot collide
   * with positive database IDs.
   */
  nextGeneratedShiftId: number

  mandatoryGeneratedShiftIds:
  Set<number>
}


/**
 * Create the live context for one scheduler run.
 */
export function createSchedulerContext(
  input: CreateSchedulerContextInput,
): SchedulerContext {
  /**
   * Employee already contains:
   *
   * id
   * titleId
   * roleIds
   *
   * so it structurally satisfies PairCandidate.
   */
  const candidates: PairCandidate[] =
    input.employees.map(employee => ({
      id:
        employee.id,

      titleId:
        employee.titleId,

      roleIds:
        employee.roleIds,
    }))


  return {
    /**
     * Copy arrays so the scheduler does not accidentally
     * mutate data owned by schedule.ts / DB loading code.
     */
    employees: [
      ...input.employees,
    ],

    titles: [
      ...input.titles,
    ],

    categories: [
      ...input.categories,
    ],

    holidayDates:
      new Set(
        input.holidayDates,
      ),

    pairRoles:
      input.pairRoles,

    candidates,

    lockedShifts: [
      ...input.lockedShifts,
    ],

    /**
     * Start the live schedule using everything
     * already known before generation.
     */
    workingShifts: [
      ...input.existingShifts,
    ],

    generatedShifts: [],

    random:
      input.random,

    seed:
      input.seed,

    /**
     * First generated shift:
     * -1
     *
     * Then:
     * -2
     * -3
     * ...
     */
    nextGeneratedShiftId: -1,

    mandatoryGeneratedShiftIds: new Set(),
  }
}


/**
 * Information required to turn a successful scheduler
 * assignment into a real Shift object.
 */
export type GeneratedShiftInput = {
  employeeId: number

  locationId: number

  roleId: number

  categoryId: number

  date: string

  mandatory?: boolean
}


/**
 * Add a newly generated assignment to the LIVE schedule.
 *
 * This is one of the most important functions in context.ts.
 *
 *
 * Example:
 *
 * Employee 10 receives Morning Oct 5.
 *
 * Before:
 *
 * workingShifts
 *   = DB/manual shifts
 *
 * After:
 *
 * workingShifts
 *   = DB/manual shifts
 *   + Employee 10 Morning Oct 5
 *
 *
 * Therefore the next assignment immediately sees it.
 */
export function addGeneratedShift(
  context: SchedulerContext,
  input: GeneratedShiftInput,
): Shift {
  const shift: Shift = {
    id:
      context.nextGeneratedShiftId,

    employeeId:
      input.employeeId,

    locationId:
      input.locationId,

    roleId:
      input.roleId,

    categoryId:
      input.categoryId,

    date:
      input.date,
  }


  /**
   * Decrease the temporary ID for next time.
   *
   * -1
   * -2
   * -3
   * ...
   */
  context.nextGeneratedShiftId--


  /**
   * Keep generated shifts separately for final output.
   */
  context.generatedShifts.push(
    shift,
  )


  /**
   * ALSO add it to the live working schedule.
   *
   * This is what fixes our previous architecture problem.
   */
  context.workingShifts.push(
    shift,
  )

  if (input.mandatory) {
  context.mandatoryGeneratedShiftIds.add(
    shift.id,
  )
  }


  return shift
}


/**
 * Convert SchedulerContext into the smaller context
 * expected by canAssign().
 *
 * This prevents mandatory.ts / fill.ts from manually
 * reconstructing the same object over and over.
 */
export function createAssignmentRuleContext(
  context: SchedulerContext,
  block: ShiftBlockState,
): AssignmentRuleContext {
  return {
    titles:
      context.titles,

    block,

    candidates:
      context.candidates,

    pairRoles:
      context.pairRoles,

    holidayDates:
      context.holidayDates,

    /**
     * canAssign.ts still calls this field:
     *
     * existingShifts
     *
     * but we deliberately give it workingShifts.
     *
     * Later we can rename AssignmentRuleContext's field
     * from existingShifts -> workingShifts for clarity.
     */
    existingShifts:
      context.workingShifts,

    lockedShifts:
      context.lockedShifts,

    categories:
      context.categories,
  }
}


/**
 * Convenience helper mainly for debugging.
 */
export function getGeneratedShiftCount(
  context: SchedulerContext,
): number {
  return context.generatedShifts.length
}


/**
 * Return generated shifts without exposing the mutable
 * internal array itself.
 */
export function getGeneratedShifts(
  context: SchedulerContext,
): Shift[] {
  return [
    ...context.generatedShifts,
  ]
}

