import type {
  SchedulerContext,
} from '../../context'

import type {
  ShiftBlock,
} from '../../types'

import {
  applyGeneratedShiftSwap,
  canSwapGeneratedShifts,
} from '../swap'

import {
  MAX_REBALANCE_SWAPS,
} from './constants'

import {
  getPairBalancePenalty,
  getShiftTimeOfDay,
  simulateSwap,
} from './metrics'

import {
  tryRepairLargeImbalance,
} from './direct'

import {
  tryThreeWayBalanceRepair,
} from './three-way'

/**
 * Improve Morning / Noon / Night balance while preserving
 * every hard scheduler rule.
 */
export function rebalanceSchedule(
  context: SchedulerContext,
  blocks: ShiftBlock[],
  startDate: string,
  endDate: string,
): number {
  let swapsApplied = 0

  while (
    swapsApplied < MAX_REBALANCE_SWAPS
  ) {
    let improvedThisPass = false

    // Phase 1A — direct repair for employees outside
    // the preferred balance spread.
    const repairedLargeImbalance =
      tryRepairLargeImbalance(
        context,
        blocks,
        startDate,
        endDate,
      )

    if (repairedLargeImbalance) {
      swapsApplied++
      continue
    }

    // Phase 1B — direct repair failed, so try
    // a three-employee cycle.
    const repairedThreeWay =
      tryThreeWayBalanceRepair(
        context,
        blocks,
        startDate,
        endDate,
      )

    if (repairedThreeWay) {
      // One 3-way repair is implemented as two swaps.
      swapsApplied += 2
      continue
    }

    // Phase 2 — generic pair improvement.
    const generated =
      context.generatedShifts

    outer:
    for (
      let firstIndex = 0;
      firstIndex < generated.length;
      firstIndex++
    ) {
      const firstShift =
        generated[firstIndex]

      if (
        firstShift.employeeId === null
      ) {
        continue
      }

      const firstTimeOfDay =
        getShiftTimeOfDay(
          firstShift,
          context.categories,
        )

      if (!firstTimeOfDay) {
        continue
      }

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < generated.length;
        secondIndex++
      ) {
        const secondShift =
          generated[secondIndex]

        if (
          secondShift.employeeId === null ||
          firstShift.employeeId ===
            secondShift.employeeId
        ) {
          continue
        }

        const secondTimeOfDay =
          getShiftTimeOfDay(
            secondShift,
            context.categories,
          )

        if (
          !secondTimeOfDay ||
          firstTimeOfDay === secondTimeOfDay
        ) {
          continue
        }

        const firstEmployee =
          context.employees.find(
            employee =>
              employee.id ===
              firstShift.employeeId,
          )

        const secondEmployee =
          context.employees.find(
            employee =>
              employee.id ===
              secondShift.employeeId,
          )

        if (
          !firstEmployee ||
          !secondEmployee
        ) {
          continue
        }

        const beforePenalty =
          getPairBalancePenalty(
            firstEmployee,
            secondEmployee,
            context.workingShifts,
            context,
            startDate,
            endDate,
          )

        const simulated =
          simulateSwap(
            firstShift,
            secondShift,
            context.workingShifts,
          )

        const afterPenalty =
          getPairBalancePenalty(
            firstEmployee,
            secondEmployee,
            simulated,
            context,
            startDate,
            endDate,
          )

        if (
          afterPenalty >= beforePenalty
        ) {
          continue
        }

        const swapCheck =
          canSwapGeneratedShifts(
            firstShift,
            secondShift,
            blocks,
            context,
          )

        if (!swapCheck.allowed) {
          continue
        }

        applyGeneratedShiftSwap(
          firstShift,
          secondShift,
          context,
        )

        swapsApplied++
        improvedThisPass = true

        // Any accepted swap changes the balance counts,
        // so start scanning again from the beginning.
        break outer
      }
    }

    if (!improvedThisPass) {
      break
    }
  }

  console.log(
    `[scheduler] Rebalance applied ${swapsApplied} swaps`,
  )

  return swapsApplied
}
