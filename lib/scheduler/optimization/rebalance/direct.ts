import type {
  Employee,
} from '@/lib/types'

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
  MAX_PREFERRED_SPREAD,
} from './constants'

import {
  getEmployeeBalanceState,
  getPairBalancePenalty,
  getShiftTimeOfDay,
  simulateSwap,
  type EmployeeBalanceState,
} from './metrics'

/**
 * Repair the worst employee with a direct two-person swap.
 *
 * Example:
 *   target gives Night
 *   target receives Morning
 */
export function tryRepairLargeImbalance(
  context: SchedulerContext,
  blocks: ShiftBlock[],
  startDate: string,
  endDate: string,
): boolean {
  const employeesByImbalance =
    context.employees
      .map(employee => ({
        employee,
        state:
          getEmployeeBalanceState(
            employee,
            context.workingShifts,
            context,
            startDate,
            endDate,
          ),
      }))
      .filter(
        (
          item,
        ): item is {
          employee: Employee
          state: EmployeeBalanceState
        } =>
          item.state !== null &&
          item.state.spread >
            MAX_PREFERRED_SPREAD,
      )
      .sort(
        (a, b) =>
          b.state.spread -
          a.state.spread,
      )

  for (
    const {
      employee,
      state,
    }
    of employeesByImbalance
  ) {
    const shiftsToGive =
      context.generatedShifts.filter(
        shift => {
          if (
            shift.employeeId !== employee.id ||
            shift.roleId === null
          ) {
            return false
          }

          const timeOfDay =
            getShiftTimeOfDay(
              shift,
              context.categories,
            )

          return (
            timeOfDay !== null &&
            state.highest.includes(timeOfDay)
          )
        },
      )

    const shiftsToReceive =
      context.generatedShifts.filter(
        shift => {
          if (
            shift.employeeId === null ||
            shift.employeeId === employee.id ||
            shift.roleId === null
          ) {
            return false
          }

          const timeOfDay =
            getShiftTimeOfDay(
              shift,
              context.categories,
            )

          return (
            timeOfDay !== null &&
            state.lowest.includes(timeOfDay)
          )
        },
      )

    for (
      const giveShift
      of shiftsToGive
    ) {
      for (
        const receiveShift
        of shiftsToReceive
      ) {
        const otherEmployee =
          context.employees.find(
            other =>
              other.id ===
              receiveShift.employeeId,
          )

        if (!otherEmployee) {
          continue
        }

        const beforePenalty =
          getPairBalancePenalty(
            employee,
            otherEmployee,
            context.workingShifts,
            context,
            startDate,
            endDate,
          )

        const simulated =
          simulateSwap(
            giveShift,
            receiveShift,
            context.workingShifts,
          )

        const afterPenalty =
          getPairBalancePenalty(
            employee,
            otherEmployee,
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
            giveShift,
            receiveShift,
            blocks,
            context,
          )

        if (!swapCheck.allowed) {
          continue
        }

        applyGeneratedShiftSwap(
          giveShift,
          receiveShift,
          context,
        )

        console.log(
          '[rebalance] repaired large imbalance',
          {
            employeeId: employee.id,
            beforeSpread: state.spread,
            gave:
              getShiftTimeOfDay(
                giveShift,
                context.categories,
              ),
            received:
              getShiftTimeOfDay(
                receiveShift,
                context.categories,
              ),
          },
        )

        return true
      }
    }
  }

  return false
}
