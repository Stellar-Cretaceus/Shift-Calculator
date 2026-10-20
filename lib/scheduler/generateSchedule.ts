import type {
  Employee,
  EmployeeTitle,
  Shift,
  ShiftCategory,
  ShiftTemplate,
} from '@/lib/types'

import {
  buildRequirements,
} from './generation/buildRequirements'

import {
  createShiftBlockState,
  seedExistingAssignments,
  getRemainingCount,
} from './generation/blockState'

import {
  assignMandatoryToBlock,
} from './generation/mandatory'

import {
  fillRemainingSlots,
} from './generation/fill'

import {
  createSchedulerContext,
  getGeneratedShifts,
} from './context'

import {
  createSchedulerSeed,
  createSeededRandom,
} from './random'

import type {
  PairRoleConfig,
} from './validation/canStillCompletePairs'

import {
  rebalanceSchedule,
} from './optimization/rebalance'

import {
  resolveLockedRolesToBlock,
  type ResolvedLockedRole,
} from './generation/resolveLockedRoles'

import {
  balanceWorkingDays,
} from './optimization/workload-balance'

import {
  balanceDoubleShiftClusters,
} from './optimization/double-shift-balance'

import {
  optimizeDoubleShiftSpacing,
} from './optimization/double-spacing'

import {
  getEmployeeTimeOfDayCounts,
} from './scoring/category-balance'

import {
  repairUnfilledShifts,
} from './generation/repair-unfilled'

import {
  reduceNoonDoubleSequences,
} from './optimization/noon-double-balance'

/**
 * Everything generateSchedule() needs.
 *
 * This should eventually be supplied by the server/DB layer.
 */
export type GenerateScheduleInput = {
  startDate: string
  endDate: string

  employees: Employee[]

  titles: EmployeeTitle[]

  templates: ShiftTemplate[]

  categories: ShiftCategory[]

  /**
   * Everything already present before generation.
   *
   * Examples:
   *
   * - Vacation
   * - OFF
   * - Special
   * - manually-created normal shifts
   * - locked normal shifts
   */
  existingShifts: Shift[]

  /**
   * Immutable subset of existingShifts.
   *
   * Used for future-lock lookahead.
   */
  lockedShifts: Shift[]

  holidayDates: Set<string>

  pairRoles: PairRoleConfig

  /**
   * Optional seed override.
   *
   * Normally omitted.
   *
   * Useful later if the UI/server wants to reproduce
   * a particular generation exactly.
   */
  seed?: number
}


export type GenerateScheduleResult = {
  shifts: Shift[]

  seed: number

  totalGenerated: number

  unfilledCount: number

  resolvedLockedRoles:
    ResolvedLockedRole[]
}


/**
 * Build a YYYY-MM-DD list between startDate and endDate.
 *
 * We can move this into date/dates.ts later.
 */
function getDatesInRange(
  startDate: string,
  endDate: string,
): string[] {
  const dates: string[] = []

  const current =
    new Date(`${startDate}T00:00:00`)

  const end =
    new Date(`${endDate}T00:00:00`)


  while (current <= end) {
    const year =
      current.getFullYear()

    const month =
      String(
        current.getMonth() + 1,
      ).padStart(2, '0')

    const day =
      String(
        current.getDate(),
      ).padStart(2, '0')


    dates.push(
      `${year}-${month}-${day}`,
    )


    current.setDate(
      current.getDate() + 1,
    )
  }


  return dates
}

function debugBalanceSnapshot(
  label: string,
  context: ReturnType<
    typeof createSchedulerContext
  >,
  startDate: string,
  endDate: string,
): void {

  console.log(
    `\n[scheduler-balance] ${label}`,
    {
      startDate,
      endDate,
    },
  )


  const rangeShifts =
    context.workingShifts.filter(
      shift =>
        shift.date >= startDate &&
        shift.date <= endDate,
    )


  for (
    const employee
    of context.employees
  ) {

    const counts =
      getEmployeeTimeOfDayCounts(
        employee.id,
        rangeShifts,
        context.categories,
      )


    const values = [
      counts.morning,
      counts.noon,
      counts.night,
    ]


    const spread =
      Math.max(...values) -
      Math.min(...values)


    if (spread > 3) {

      console.log({
        employeeId:
          employee.id,

        morning:
          counts.morning,

        noon:
          counts.noon,

        night:
          counts.night,

        spread,
      })
    }
  }
}


/**
 * Main scheduler entry point.
 *
 * This is the conductor.
 *
 * It does NOT decide:
 *
 * - permissions
 * - compatibility
 * - fatigue
 * - scoring
 *
 * Those are handled by their own modules.
 */
export function generateSchedule(
  input: GenerateScheduleInput,
): GenerateScheduleResult {

  // =========================================================
  // STEP 1 — Create one seed for this entire generation
  // =========================================================

  /**
   * If caller provides a seed:
   * use it.
   *
   * Otherwise:
   * use normal scheduler seed behavior.
   */
  const seed =
    input.seed ??
    createSchedulerSeed()


  console.log(
    `[scheduler] Using seed: ${seed}`,
  )


  const random =
    createSeededRandom(
      seed,
    )


  // =========================================================
  // STEP 2 — Create live scheduler context
  // =========================================================

  const context =
    createSchedulerContext({
      employees:
        input.employees,

      titles:
        input.titles,

      categories:
        input.categories,

      existingShifts:
        input.existingShifts,

      lockedShifts:
        input.lockedShifts,

      holidayDates:
        input.holidayDates,

      pairRoles:
        input.pairRoles,

      random,

      seed,
    })


  // =========================================================
  // STEP 3 — Create generation dates
  // =========================================================

  const dates =
    getDatesInRange(
      input.startDate,
      input.endDate,
    )


  // =========================================================
  // STEP 4 — Convert templates into ShiftBlocks
  // =========================================================

  const blocks =
    buildRequirements(
      input.templates,
      dates,
    )


  /**
   * Deterministic processing order.
   *
   * We do NOT randomize block order yet.
   *
   * This makes debugging much easier.
   */
  blocks.sort((a, b) => {

    if (a.date !== b.date) {
      return a.date.localeCompare(
        b.date,
      )
    }

    if (
      a.locationId !==
      b.locationId
    ) {
      return (
        a.locationId -
        b.locationId
      )
    }

    return (
      a.categoryId -
      b.categoryId
    )
  })


  // =========================================================
  // STEP 5 — Process every ShiftBlock
  // =========================================================

  

  let unfilledShifts: Shift[] = []

  let nextOpenShiftId =
    -1000000000

  const resolvedLockedRoles:
  ResolvedLockedRole[] = []
  
  for (const block of blocks) {

    let state =
      createShiftBlockState(
        block,
      )

    state =
  seedExistingAssignments(
    state,
    context.workingShifts,
    context.employees,
  )


  // -------------------------------------------------------
  // Phase A — Resolve roles of fixed/locked employees
  // -------------------------------------------------------

  /**
   * Example:
   *
   * Alice is manually locked to Morning,
   * but roleId is null.
   *
   * Employee/date/category/location stay fixed.
   *
   * This phase only decides whether Alice occupies
   * In Charge or Member.
   */
  const lockedRoleResult =
    resolveLockedRolesToBlock(
      state,
      context,
    )


  state =
    lockedRoleResult.state


  resolvedLockedRoles.push(
    ...lockedRoleResult.resolved,
  )


  if (
    lockedRoleResult
      .unresolvedShiftIds
      .length > 0
  ) {
    console.warn(
      '[scheduler] Could not resolve roles for locked shifts:',
      lockedRoleResult.unresolvedShiftIds,
    )
  }


// -------------------------------------------------------
// Phase B — Mandatory employees
// -------------------------------------------------------

    const mandatoryResult =
      assignMandatoryToBlock(
        state,
        context,
      )

    state =
      mandatoryResult.state


    // Phase C — normal fill
    const fillResult =
      fillRemainingSlots(
        state,
        context,
      )

    state =
      fillResult.state


    // =========================================================
    // AFTER FILL:
    // Convert any still-unfilled requirements
    // into visible Open shift placeholders
    // =========================================================

    for (
      const requirement
      of state.requirements
    ) {
      const remaining =
        getRemainingCount(
          state,
          requirement.roleId,
        )

      for (
        let i = 0;
        i < remaining;
        i++
      ) {
        unfilledShifts.push({
          id:
            nextOpenShiftId--,

          employeeId:
            null,

          locationId:
            state.locationId,

          roleId:
            requirement.roleId,

          categoryId:
            state.categoryId,

          date:
            state.date,
        })
      }
    }

  }

  // =========================================================
  // STEP 6 — Try to repair remaining Open slots
  // =========================================================

  const repairResult =
    repairUnfilledShifts(
      unfilledShifts,
      blocks,
      context,
    )


  unfilledShifts =
    repairResult
      .remainingUnfilledShifts


  // =========================================================
  // STEP 7 — Improve the finished valid schedule
  // =========================================================

  /**
   * Generation already gave us a legal schedule.
   *
   * Rebalancing may exchange GENERATED assignments
   * if:
   *
   * - Morning/Noon/Night balance improves
   * - both replacement assignments still pass
   *   every hard rule
   *
   * Manual/locked shifts are never moved.
   */
  debugBalanceSnapshot(
    'BEFORE REBALANCE',
    context,
    input.startDate,
    input.endDate,
    
  )


  rebalanceSchedule(
    context,
    blocks,
    input.startDate,
    input.endDate,
  )


  debugBalanceSnapshot(
    'AFTER REBALANCE',
    context,
    input.startDate,
    input.endDate,
  )


  balanceWorkingDays(
    context,
    blocks,
  )


  debugBalanceSnapshot(
    'AFTER WORKLOAD',
    context,
    input.startDate,
    input.endDate,
  )


  balanceDoubleShiftClusters(
    context,
    blocks,
  )


  debugBalanceSnapshot(
    'AFTER DOUBLE CLUSTER',
    context,
    input.startDate,
    input.endDate,
  )


  optimizeDoubleShiftSpacing(
    context,
    blocks,
  )


  debugBalanceSnapshot(
    'AFTER DOUBLE SPACING',
    context,
    input.startDate,
    input.endDate,
  )

  reduceNoonDoubleSequences(
    context,
    blocks,
  )

  // Final category-balance cleanup
  rebalanceSchedule(
    context,
    blocks,
    input.startDate,
    input.endDate,
  )

  debugBalanceSnapshot(
    'AFTER FINAL REBALANCE',
    context,
    input.startDate,
    input.endDate,
  )

  // =========================================================
  // STEP 8 — Return only newly generated shifts
  // =========================================================

  const generatedShifts =
    getGeneratedShifts(
      context,
    )

    console.log(
      '[RETURN-DEBUG]',
      {
        seed,

        generatedCount:
          generatedShifts.length,

        workingCount:
          context.workingShifts.length,

        generatedByEmployee:
          context.employees.map(
            employee => {

              const generatedCounts =
                getEmployeeTimeOfDayCounts(
                  employee.id,
                  generatedShifts,
                  context.categories,
                )

              return {
                employeeId:
                  employee.id,

                morning:
                  generatedCounts.morning,

                noon:
                  generatedCounts.noon,

                night:
                  generatedCounts.night,
              }
            },
          ),
      },
    )

    const finalReturnedSchedule = [
    ...input.existingShifts.filter(
      shift =>
        shift.date >= input.startDate &&
        shift.date <= input.endDate,
    ),
    ...generatedShifts,
  ]

  console.log(
  '[RETURN-FINAL-DEBUG]',
  {
    seed,

    employees:
          context.employees.map(
            employee => {

              const counts =
                getEmployeeTimeOfDayCounts(
                  employee.id,
                  finalReturnedSchedule,
                  context.categories,
                )

              return {
                employeeId:
                  employee.id,

                morning:
                  counts.morning,

                noon:
                  counts.noon,

                night:
                  counts.night,
              }
            },
          ),
      },
    )

  return {
    shifts: [
      ...generatedShifts,
      ...unfilledShifts,
    ],

    seed,

    totalGenerated:
      generatedShifts.length,

    unfilledCount:
      unfilledShifts.length,

    resolvedLockedRoles,
  }
}