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
  addGeneratedShift,
  createAssignmentRuleContext,
} from '../context'

import {
  createShiftBlockState,
  seedExistingAssignments,
} from './blockState'

import {
  canAssign,
  type AssignmentRequirement,
} from '../rules/canAssign'

import {
  hasFatigueViolationAroundDate,
} from '../rules/fatigue'


/**
 * Cheap/default repair.
 *
 * OPEN <- A
 * A-old <- B
 * B-old <- C
 */
const NORMAL_REPAIR_DEPTH = 2

/**
 * Expensive fallback.
 *
 * Only remaining Open slots get this:
 *
 * OPEN <- A
 * A-old <- B
 * B-old <- C
 * C-old <- D
 */
const FALLBACK_REPAIR_DEPTH = 3


/**
 * Cheap search should stay fairly small.
 */
const NORMAL_ATTEMPTS_PER_OPEN = 300

/**
 * Depth 3 branches much more heavily,
 * so give it a larger search budget.
 */
const FALLBACK_ATTEMPTS_PER_OPEN = 2000


/**
 * Repairing one Open may make another one possible.
 */
const MAX_NORMAL_PASSES = 3

/**
 * We don't need too many expensive passes.
 */
const MAX_FALLBACK_PASSES = 2


type RepairPlacement = {
  slot: Shift
  employeeId: number
}


type RepairSearchResult = {
  placements: RepairPlacement[]
  depth: number
}


type RepairBudget = {
  attempts: number
  maxAttempts: number
}


export type RepairUnfilledResult = {
  remainingUnfilledShifts: Shift[]

  repairedCount: number

  directRepairs: number
  depth1Repairs: number
  depth2Repairs: number
  depth3Repairs: number

  normalAttempts: number
  fallbackAttempts: number
  attempts: number
}


/**
 * Find the configured ShiftBlock belonging to one slot.
 */
function findBlockForSlot(
  slot: Shift,
  blocks: ShiftBlock[],
): ShiftBlock | undefined {
  return blocks.find(
    block =>
      block.date === slot.date &&
      block.locationId ===
        slot.locationId &&
      block.categoryId ===
        slot.categoryId,
  )
}


/**
 * Convert a Shift-shaped slot into the format
 * canAssign() expects.
 */
function createRequirement(
  slot: Shift,
): AssignmentRequirement | null {

  if (slot.roleId === null) {
    return null
  }

  return {
    date:
      slot.date,

    locationId:
      slot.locationId,

    roleId:
      slot.roleId,

    categoryId:
      slot.categoryId,
  }
}


/**
 * Rebuild block state from a SIMULATED schedule.
 *
 * This lets pairing / role capacity see the schedule
 * exactly as it would look during this repair attempt.
 */
function buildStateForSlot(
  slot: Shift,
  workingShifts: Shift[],
  blocks: ShiftBlock[],
  context: SchedulerContext,
) {
  const block =
    findBlockForSlot(
      slot,
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
 * Return a COPY with one shift removed.
 *
 * Used only for simulation.
 */
function removeShift(
  shifts: Shift[],
  shiftId: number,
): Shift[] {
  return shifts.filter(
    shift =>
      shift.id !== shiftId,
  )
}


/**
 * Return a COPY with an employee placed into a slot.
 */
function addSimulatedAssignment(
  shifts: Shift[],
  slot: Shift,
  employeeId: number,
): Shift[] {
  return [
    ...shifts,

    {
      ...slot,
      employeeId,
    },
  ]
}


/**
 * Spend one search attempt.
 */
function spendAttempt(
  budget: RepairBudget,
): boolean {

  if (
    budget.attempts >=
    budget.maxAttempts
  ) {
    return false
  }

  budget.attempts++

  return true
}


/**
 * Can this employee occupy this slot in THIS simulated
 * schedule?
 *
 * This is the most important helper.
 *
 * It does:
 *
 *   simulated schedule
 *        ↓
 *   rebuild block state
 *        ↓
 *   canAssign()
 *        ↓
 *   full fatigue audit
 *
 * Repair happens after the month has already been built,
 * so incremental fatigue checking alone is not enough.
 */
function canPlaceEmployee(
  employee: Employee,
  slot: Shift,
  workingShifts: Shift[],
  blocks: ShiftBlock[],
  context: SchedulerContext,
  budget: RepairBudget,
): boolean {

  if (!spendAttempt(budget)) {
    return false
  }


  const requirement =
    createRequirement(
      slot,
    )

  if (!requirement) {
    return false
  }


  const state =
    buildStateForSlot(
      slot,
      workingShifts,
      blocks,
      context,
    )

  if (!state) {
    return false
  }


  /**
   * Give canAssign() our SIMULATED schedule,
   * not the real schedule.
   */
  const temporaryContext:
    SchedulerContext = {
      ...context,

      workingShifts,
    }


  const ruleContext =
    createAssignmentRuleContext(
      temporaryContext,
      state,
    )


  const check =
    canAssign(
      employee,
      requirement,
      ruleContext,
    )


  if (!check.allowed) {
    return false
  }


  /**
   * canAssign() approved the placement.
   *
   * Now inspect fatigue on the COMPLETE result,
   * including future generated shifts.
   */
  const simulatedSchedule =
    addSimulatedAssignment(
      workingShifts,
      slot,
      employee.id,
    )


  if (
    hasFatigueViolationAroundDate(
      employee.id,
      slot.date,
      simulatedSchedule,
      context.categories,
    )
  ) {
    return false
  }


  return true
}


/**
 * Which assignments may the repair search displace?
 *
 * Never move:
 *
 * - mandatory generated shifts
 * - roleless shifts
 * - manual / locked shifts
 * - Special / OFF / Vacation
 *
 * context.generatedShifts means manual/DB shifts are
 * naturally excluded already.
 */
function getMovableGeneratedShifts(
  employeeId: number,
  workingShifts: Shift[],
  context: SchedulerContext,
): Shift[] {

  return context.generatedShifts.filter(
    shift => {

      if (
        shift.employeeId !==
          employeeId ||
        shift.roleId === null
      ) {
        return false
      }


      /**
       * This shift may already have been removed
       * earlier in the simulated chain.
       */
      const stillExists =
        workingShifts.some(
          workingShift =>
            workingShift.id ===
            shift.id,
        )

      if (!stillExists) {
        return false
      }


      if (
        context
          .mandatoryGeneratedShiftIds
          .has(shift.id)
      ) {
        return false
      }


      const category =
        context.categories.find(
          category =>
            category.id ===
            shift.categoryId,
        )


      return (
        category?.type ===
        'regular'
      )
    },
  )
}


/**
 * Keep search order stable for now.
 *
 * Later we can reuse candidate scoring here if necessary.
 *
 * The final optimizers already handle fairness,
 * while repair's main goal is simply:
 *
 * "Can we legally close this required slot?"
 */
function getCandidateEmployees(
  context: SchedulerContext,
  visitedEmployeeIds:
    Set<number>,
): Employee[] {

  return context.employees
    .filter(
      employee =>
        !visitedEmployeeIds.has(
          employee.id,
        ),
    )
    .slice()
    .sort(
      (a, b) =>
        a.id - b.id,
    )
}


/**
 * THE CORE SEARCH.
 *
 * Think of `slot` as "the current hole".
 *
 *
 * First:
 *
 *     hole ← somebody directly
 *
 *
 * If that fails:
 *
 *     hole ← Alice
 *
 * but first remove Alice's old shift.
 *
 * Alice's old shift now becomes the NEW hole.
 *
 *
 * This recursively gives:
 *
 * depth 1:
 *
 *     OPEN ← Alice
 *     Alice-old ← Bob
 *
 *
 * depth 2:
 *
 *     OPEN ← Alice
 *     Alice-old ← Bob
 *     Bob-old ← Carol
 */
function searchHole(
  slot: Shift,
  workingShifts: Shift[],
  blocks: ShiftBlock[],
  context: SchedulerContext,

  depthRemaining: number,

  visitedEmployeeIds:
    Set<number>,

  visitedShiftIds:
    Set<number>,

  budget: RepairBudget,
): RepairSearchResult | null {

  // =========================================================
  // OPTION 1 — DIRECT FILL
  // =========================================================

  for (
    const employee
    of getCandidateEmployees(
      context,
      visitedEmployeeIds,
    )
  ) {

    if (
      canPlaceEmployee(
        employee,
        slot,
        workingShifts,
        blocks,
        context,
        budget,
      )
    ) {
      return {
        placements: [
          {
            slot,
            employeeId:
              employee.id,
          },
        ],

        depth: 0,
      }
    }


    if (
      budget.attempts >=
      budget.maxAttempts
    ) {
      return null
    }
  }


  // =========================================================
  // OPTION 2 — DISPLACE SOMEBODY
  // =========================================================

  if (depthRemaining <= 0) {
    return null
  }


  for (
    const employee
    of getCandidateEmployees(
      context,
      visitedEmployeeIds,
    )
  ) {

    const movableShifts =
      getMovableGeneratedShifts(
        employee.id,
        workingShifts,
        context,
      )


    for (
      const oldShift
      of movableShifts
    ) {

      if (
        visitedShiftIds.has(
          oldShift.id,
        )
      ) {
        continue
      }


      /**
       * Remove Alice's old shift first.
       *
       * This may:
       *
       * - fix fatigue
       * - free a same-day combination
       * - remove a block duplicate
       * - remove a Night→Morning conflict
       */
      const withoutOldShift =
        removeShift(
          workingShifts,
          oldShift.id,
        )


      /**
       * Can Alice occupy our current hole
       * once her old assignment is gone?
       */
      if (
        !canPlaceEmployee(
          employee,
          slot,
          withoutOldShift,
          blocks,
          context,
          budget,
        )
      ) {

        if (
          budget.attempts >=
          budget.maxAttempts
        ) {
          return null
        }

        continue
      }


      /**
       * Simulate:
       *
       * current hole ← Alice
       *
       * Alice's OLD shift now becomes the new hole.
       */
      const afterMove =
        addSimulatedAssignment(
          withoutOldShift,
          slot,
          employee.id,
        )


      const nextVisitedEmployees =
        new Set(
          visitedEmployeeIds,
        )

      nextVisitedEmployees.add(
        employee.id,
      )


      const nextVisitedShifts =
        new Set(
          visitedShiftIds,
        )

      nextVisitedShifts.add(
        oldShift.id,
      )


      /**
       * Recursively repair the hole we just created.
       */
      const tail =
        searchHole(
          oldShift,
          afterMove,
          blocks,
          context,

          depthRemaining - 1,

          nextVisitedEmployees,
          nextVisitedShifts,

          budget,
        )


      if (!tail) {
        continue
      }


      /**
       * Example result:
       *
       * [
       *   OPEN  <- Alice,
       *   old-A <- Bob,
       *   old-B <- Carol,
       * ]
       */
      return {
        placements: [
          {
            slot,
            employeeId:
              employee.id,
          },

          ...tail.placements,
        ],

        depth:
          tail.depth + 1,
      }
    }
  }


  return null
}


/**
 * Change owner of an EXISTING generated shift.
 *
 * generatedShifts and workingShifts both need to stay
 * synchronized.
 */
function reassignGeneratedShift(
  shiftId: number,
  newEmployeeId: number,
  context: SchedulerContext,
): void {

  for (
    const shift
    of context.generatedShifts
  ) {
    if (shift.id === shiftId) {
      shift.employeeId =
        newEmployeeId
    }
  }


  for (
    const shift
    of context.workingShifts
  ) {
    if (shift.id === shiftId) {
      shift.employeeId =
        newEmployeeId
    }
  }
}


/**
 * Search is simulated until this point.
 *
 * Only here do we touch the real SchedulerContext.
 */
function applyRepair(
  originalOpenSlot: Shift,
  result: RepairSearchResult,
  context: SchedulerContext,
): void {

  for (
    const placement
    of result.placements
  ) {

    const alreadyGenerated =
      context.generatedShifts.some(
        shift =>
          shift.id ===
          placement.slot.id,
      )


    if (alreadyGenerated) {

      /**
       * Existing generated slot:
       *
       * only change employeeId.
       */
      reassignGeneratedShift(
        placement.slot.id,
        placement.employeeId,
        context,
      )

      continue
    }


    /**
     * This should only happen for the ORIGINAL open slot.
     */
    if (
      placement.slot.id !==
      originalOpenSlot.id
    ) {
      throw new Error(
        'Open repair found a non-generated displaced slot.',
      )
    }


    if (
      placement.slot.roleId === null
    ) {
      throw new Error(
        'Open repair received a roleless required slot.',
      )
    }


    /**
     * The original hole becomes a brand-new generated shift.
     */
    addGeneratedShift(
      context,
      {
        employeeId:
          placement.employeeId,

        locationId:
          placement.slot.locationId,

        roleId:
          placement.slot.roleId,

        categoryId:
          placement.slot.categoryId,

        date:
          placement.slot.date,
      },
    )
  }
}


/**
 * Try repairing ONE Open slot.
 *
 * The caller decides:
 *
 * - how deep we may search
 * - how many attempts we may spend
 *
 * This lets us reuse exactly the same search engine for:
 *
 * normal repair:
 *   depth 2 / 300 attempts
 *
 * fallback repair:
 *   depth 3 / 2000 attempts
 */
function tryRepairOpenSlot(
  openSlot: Shift,
  blocks: ShiftBlock[],
  context: SchedulerContext,

  maxDepth: number,
  maxAttempts: number,
): {
  result: RepairSearchResult | null
  attempts: number
} {

  const budget:
    RepairBudget = {
      attempts: 0,
      maxAttempts,
    }


  const result =
    searchHole(
      openSlot,

      context.workingShifts,

      blocks,
      context,

      maxDepth,

      new Set<number>(),
      new Set<number>(),

      budget,
    )


  return {
    result,

    attempts:
      budget.attempts,
  }
}

type RepairPhaseResult = {
  remaining: Shift[]

  repairedCount: number

  directRepairs: number
  depth1Repairs: number
  depth2Repairs: number
  depth3Repairs: number

  attempts: number
}


/**
 * Run ONE repair phase.
 *
 * Example normal phase:
 *
 * maxDepth = 2
 * maxAttemptsPerOpen = 300
 *
 *
 * Example fallback:
 *
 * maxDepth = 3
 * maxAttemptsPerOpen = 2000
 */
function runRepairPhase(
  initialOpenShifts: Shift[],
  blocks: ShiftBlock[],
  context: SchedulerContext,

  maxDepth: number,
  maxAttemptsPerOpen: number,
  maxPasses: number,

  phaseName: string,
): RepairPhaseResult {

  let remaining = [
    ...initialOpenShifts,
  ]


  let repairedCount = 0

  let directRepairs = 0
  let depth1Repairs = 0
  let depth2Repairs = 0
  let depth3Repairs = 0

  let totalAttempts = 0


  for (
    let pass = 1;
    pass <= maxPasses;
    pass++
  ) {

    if (remaining.length === 0) {
      break
    }


    let repairedThisPass = 0

    const nextRemaining:
      Shift[] = []


    for (
      const openSlot
      of remaining
    ) {

      const {
        result,
        attempts,
      } =
        tryRepairOpenSlot(
          openSlot,
          blocks,
          context,

          maxDepth,
          maxAttemptsPerOpen,
        )


      totalAttempts +=
        attempts


      /**
       * No legal solution found at this depth.
       *
       * Keep it for:
       *
       * - another pass
       * - or the deeper fallback phase
       */
      if (!result) {

        nextRemaining.push(
          openSlot,
        )


        console.log(
          `[open-repair:${phaseName}] unresolved`,
          {
            date:
              openSlot.date,

            locationId:
              openSlot.locationId,

            categoryId:
              openSlot.categoryId,

            roleId:
              openSlot.roleId,

            maxDepth,

            attempts,
          },
        )


        continue
      }


      /**
       * Search found a COMPLETE legal chain.
       *
       * Only now mutate the real schedule.
       */
      applyRepair(
        openSlot,
        result,
        context,
      )


      repairedCount++
      repairedThisPass++


      if (result.depth === 0) {

        directRepairs++

      } else if (
        result.depth === 1
      ) {

        depth1Repairs++

      } else if (
        result.depth === 2
      ) {

        depth2Repairs++

      } else {

        depth3Repairs++
      }


      console.log(
        `[open-repair:${phaseName}] repaired`,
        {
          pass,

          depth:
            result.depth,

          date:
            openSlot.date,

          locationId:
            openSlot.locationId,

          categoryId:
            openSlot.categoryId,

          roleId:
            openSlot.roleId,

          attempts,
        },
      )
    }


    remaining =
      nextRemaining


    /**
     * Nobody was repaired during this whole pass.
     *
     * Running exactly the same search again
     * would accomplish nothing.
     */
    if (
      repairedThisPass === 0
    ) {
      break
    }
  }


  return {
    remaining,

    repairedCount,

    directRepairs,
    depth1Repairs,
    depth2Repairs,
    depth3Repairs,

    attempts:
      totalAttempts,
  }
}



/**
 * Main Open-slot repair.
 *
 *
 * PHASE 1:
 *
 * Cheap search.
 *
 * direct
 * depth 1
 * depth 2
 *
 *
 * PHASE 2:
 *
 * ONLY if Open slots remain:
 *
 * try depth 3 with a much larger attempt budget.
 */
export function repairUnfilledShifts(
  unfilledShifts: Shift[],
  blocks: ShiftBlock[],
  context: SchedulerContext,
): RepairUnfilledResult {

  const originalCount =
    unfilledShifts.length


  // =========================================================
  // PHASE 1 — NORMAL REPAIR
  // =========================================================

  const normalResult =
    runRepairPhase(
      unfilledShifts,
      blocks,
      context,

      NORMAL_REPAIR_DEPTH,
      NORMAL_ATTEMPTS_PER_OPEN,
      MAX_NORMAL_PASSES,

      'normal',
    )


  console.log(
    '[open-repair] normal phase finished',
    {
      before:
        originalCount,

      repaired:
        normalResult.repairedCount,

      remaining:
        normalResult.remaining.length,

      attempts:
        normalResult.attempts,
    },
  )


  // =========================================================
  // PHASE 2 — DEPTH-3 FALLBACK
  // =========================================================

  /**
   * Important:
   *
   * if normal repair already reached Open = 0,
   * this expensive search NEVER runs.
   */
  let fallbackResult:
    RepairPhaseResult = {
      remaining:
        normalResult.remaining,

      repairedCount: 0,

      directRepairs: 0,
      depth1Repairs: 0,
      depth2Repairs: 0,
      depth3Repairs: 0,

      attempts: 0,
    }


  if (
    normalResult.remaining.length > 0
  ) {

    console.log(
      '[open-repair] starting depth-3 fallback',
      {
        remaining:
          normalResult.remaining.length,
      },
    )


    fallbackResult =
      runRepairPhase(
        normalResult.remaining,
        blocks,
        context,

        FALLBACK_REPAIR_DEPTH,
        FALLBACK_ATTEMPTS_PER_OPEN,
        MAX_FALLBACK_PASSES,

        'fallback',
      )
  }


  // =========================================================
  // COMBINE STATISTICS
  // =========================================================

  const repairedCount =
    normalResult.repairedCount +
    fallbackResult.repairedCount


  const directRepairs =
    normalResult.directRepairs +
    fallbackResult.directRepairs


  const depth1Repairs =
    normalResult.depth1Repairs +
    fallbackResult.depth1Repairs


  const depth2Repairs =
    normalResult.depth2Repairs +
    fallbackResult.depth2Repairs


  const depth3Repairs =
    normalResult.depth3Repairs +
    fallbackResult.depth3Repairs


  const totalAttempts =
    normalResult.attempts +
    fallbackResult.attempts


  // =========================================================
  // FINAL DEBUG
  // =========================================================

  console.log(
    '[open-repair] finished',
    {
      before:
        originalCount,

      repaired:
        repairedCount,

      remaining:
        fallbackResult
          .remaining
          .length,

      direct:
        directRepairs,

      depth1:
        depth1Repairs,

      depth2:
        depth2Repairs,

      depth3:
        depth3Repairs,

      normalAttempts:
        normalResult.attempts,

      fallbackAttempts:
        fallbackResult.attempts,

      totalAttempts,
    },
  )


  return {
    remainingUnfilledShifts:
      fallbackResult.remaining,

    repairedCount,

    directRepairs,
    depth1Repairs,
    depth2Repairs,
    depth3Repairs,

    normalAttempts:
      normalResult.attempts,

    fallbackAttempts:
      fallbackResult.attempts,

    attempts:
      totalAttempts,
  }
}