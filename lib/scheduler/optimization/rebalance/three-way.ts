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
  MAX_TEMPORARY_SPREAD,
  MAX_THREE_WAY_ATTEMPTS,
} from './constants'

import {
  cloneContextForRebalance,
  getEmployeeBalancePenalty,
  getEmployeeBalanceState,
  getEmployeeSpread,
  getShiftTimeOfDay,
  type EmployeeBalanceState,
} from './metrics'

/**
 * Fallback when a direct A <-> B repair is impossible.
 *
 * Final cycle:
 *   A gets B's low-bucket shift
 *   B gets C's bridge shift
 *   C gets A's high-bucket shift
 *
 * Implemented as two simulated swaps before touching
 * the real scheduler state.
 */
export function tryThreeWayBalanceRepair(
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

  let attempts = 0

  for (
    const {
      employee: targetEmployee,
      state: targetState,
    }
    of employeesByImbalance
  ) {
    const shiftsToGive =
      context.generatedShifts.filter(
        shift => {
          if (
            shift.employeeId !== targetEmployee.id ||
            shift.roleId === null ||
            context.mandatoryGeneratedShiftIds.has(shift.id)
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
            targetState.highest.includes(timeOfDay)
          )
        },
      )

    const shiftsToReceive =
      context.generatedShifts.filter(
        shift => {
          if (
            shift.employeeId === null ||
            shift.employeeId === targetEmployee.id ||
            shift.roleId === null ||
            context.mandatoryGeneratedShiftIds.has(shift.id)
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
            targetState.lowest.includes(timeOfDay)
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
        if (
          receiveShift.employeeId === null
        ) {
          continue
        }

        const receiverEmployee =
          context.employees.find(
            employee =>
              employee.id ===
              receiveShift.employeeId,
          )

        if (!receiverEmployee) {
          continue
        }

        const bridgeShifts =
          context.generatedShifts.filter(
            shift => {
              if (
                shift.employeeId === null ||
                shift.roleId === null ||
                shift.employeeId === targetEmployee.id ||
                shift.employeeId === receiverEmployee.id ||
                context.mandatoryGeneratedShiftIds.has(shift.id)
              ) {
                return false
              }

              return (
                getShiftTimeOfDay(
                  shift,
                  context.categories,
                ) !== null
              )
            },
          )

        for (
          const bridgeShift
          of bridgeShifts
        ) {
          attempts++

          if (
            attempts > MAX_THREE_WAY_ATTEMPTS
          ) {
            return false
          }

          if (
            bridgeShift.employeeId === null
          ) {
            continue
          }

          const bridgeEmployee =
            context.employees.find(
              employee =>
                employee.id ===
                bridgeShift.employeeId,
            )

          if (!bridgeEmployee) {
            continue
          }

          const targetBeforeSpread =
            getEmployeeSpread(
              targetEmployee,
              context.workingShifts,
              context,
              startDate,
              endDate,
            )

          const receiverBeforeSpread =
            getEmployeeSpread(
              receiverEmployee,
              context.workingShifts,
              context,
              startDate,
              endDate,
            )

          const bridgeBeforeSpread =
            getEmployeeSpread(
              bridgeEmployee,
              context.workingShifts,
              context,
              startDate,
              endDate,
            )

          const beforePenalty =
            getEmployeeBalancePenalty(
              targetEmployee,
              context.workingShifts,
              context,
              startDate,
              endDate,
            ) +
            getEmployeeBalancePenalty(
              receiverEmployee,
              context.workingShifts,
              context,
              startDate,
              endDate,
            ) +
            getEmployeeBalancePenalty(
              bridgeEmployee,
              context.workingShifts,
              context,
              startDate,
              endDate,
            )

          const simulatedContext =
            cloneContextForRebalance(
              context,
            )

          const simulatedGiveShift =
            simulatedContext.generatedShifts.find(
              shift =>
                shift.id === giveShift.id,
            )

          const simulatedBridgeShift =
            simulatedContext.generatedShifts.find(
              shift =>
                shift.id === bridgeShift.id,
            )

          if (
            !simulatedGiveShift ||
            !simulatedBridgeShift
          ) {
            continue
          }

          const firstSwapCheck =
            canSwapGeneratedShifts(
              simulatedGiveShift,
              simulatedBridgeShift,
              blocks,
              simulatedContext,
            )

          if (!firstSwapCheck.allowed) {
            continue
          }

          applyGeneratedShiftSwap(
            simulatedGiveShift,
            simulatedBridgeShift,
            simulatedContext,
          )

          const bridgeAfterFirstSwap =
            simulatedContext.generatedShifts.find(
              shift =>
                shift.id === bridgeShift.id,
            )

          const receiveAfterFirstSwap =
            simulatedContext.generatedShifts.find(
              shift =>
                shift.id === receiveShift.id,
            )

          if (
            !bridgeAfterFirstSwap ||
            !receiveAfterFirstSwap
          ) {
            continue
          }

          const secondSwapCheck =
            canSwapGeneratedShifts(
              bridgeAfterFirstSwap,
              receiveAfterFirstSwap,
              blocks,
              simulatedContext,
            )

          if (!secondSwapCheck.allowed) {
            continue
          }

          applyGeneratedShiftSwap(
            bridgeAfterFirstSwap,
            receiveAfterFirstSwap,
            simulatedContext,
          )

          const targetAfterSpread =
            getEmployeeSpread(
              targetEmployee,
              simulatedContext.workingShifts,
              simulatedContext,
              startDate,
              endDate,
            )

          const receiverAfterSpread =
            getEmployeeSpread(
              receiverEmployee,
              simulatedContext.workingShifts,
              simulatedContext,
              startDate,
              endDate,
            )

          const bridgeAfterSpread =
            getEmployeeSpread(
              bridgeEmployee,
              simulatedContext.workingShifts,
              simulatedContext,
              startDate,
              endDate,
            )

          if (
            targetAfterSpread >= targetBeforeSpread
          ) {
            continue
          }

          const receiverTooDamaged =
            receiverAfterSpread > MAX_TEMPORARY_SPREAD &&
            receiverAfterSpread > receiverBeforeSpread

          const bridgeTooDamaged =
            bridgeAfterSpread > MAX_TEMPORARY_SPREAD &&
            bridgeAfterSpread > bridgeBeforeSpread

          if (
            receiverTooDamaged ||
            bridgeTooDamaged
          ) {
            continue
          }

          const afterPenalty =
            getEmployeeBalancePenalty(
              targetEmployee,
              simulatedContext.workingShifts,
              simulatedContext,
              startDate,
              endDate,
            ) +
            getEmployeeBalancePenalty(
              receiverEmployee,
              simulatedContext.workingShifts,
              simulatedContext,
              startDate,
              endDate,
            ) +
            getEmployeeBalancePenalty(
              bridgeEmployee,
              simulatedContext.workingShifts,
              simulatedContext,
              startDate,
              endDate,
            )

          if (
            afterPenalty >= beforePenalty
          ) {
            continue
          }

          applyGeneratedShiftSwap(
            giveShift,
            bridgeShift,
            context,
          )

          const realBridgeAfterFirstSwap =
            context.generatedShifts.find(
              shift =>
                shift.id === bridgeShift.id,
            )

          const realReceiveAfterFirstSwap =
            context.generatedShifts.find(
              shift =>
                shift.id === receiveShift.id,
            )

          if (
            !realBridgeAfterFirstSwap ||
            !realReceiveAfterFirstSwap
          ) {
            throw new Error(
              'Three-way rebalance lost generated shift references.',
            )
          }

          applyGeneratedShiftSwap(
            realBridgeAfterFirstSwap,
            realReceiveAfterFirstSwap,
            context,
          )

          console.log(
            '[rebalance] 3-way repair',
            {
              targetEmployeeId: targetEmployee.id,
              receiverEmployeeId: receiverEmployee.id,
              bridgeEmployeeId: bridgeEmployee.id,
              targetBeforeSpread,
              targetAfterSpread,
              receiverBeforeSpread,
              receiverAfterSpread,
              bridgeBeforeSpread,
              bridgeAfterSpread,
              beforePenalty,
              afterPenalty,
            },
          )

          return true
        }
      }
    }
  }

  return false
}
