import type {
  Employee,
  EmployeeTitle,
  Shift,
  ShiftCategory,
} from '@/lib/types'

import type {
  SchedulerContext,
} from '../../context'

import {
  canTitleWorkCategory,
} from '../../rules/permissions'

import {
  getEmployeeTimeOfDayCounts,
  type NormalTimeOfDay,
} from '../../scoring/category-balance'

export type EmployeeBalanceState = {
  spread: number
  highest: NormalTimeOfDay[]
  lowest: NormalTimeOfDay[]
}

function findEmployeeTitle(
  employee: Employee,
  titles: EmployeeTitle[],
): EmployeeTitle | undefined {
  return titles.find(
    title =>
      title.id === employee.titleId,
  )
}

export function getEligibleTimeOfDays(
  employee: Employee,
  context: SchedulerContext,
): NormalTimeOfDay[] {
  const title =
    findEmployeeTitle(
      employee,
      context.titles,
    )

  if (!title) {
    return []
  }

  const eligible =
    new Set<NormalTimeOfDay>()

  for (
    const category of
    context.categories
  ) {
    // Special shifts count toward totals, but only
    // regular categories define normal eligibility.
    if (
      category.type !== 'regular' ||
      category.timeOfDay === 'none'
    ) {
      continue
    }

    if (
      !canTitleWorkCategory(
        title,
        category.id,
      )
    ) {
      continue
    }

    eligible.add(
      category.timeOfDay as NormalTimeOfDay,
    )
  }

  return [...eligible]
}

export function getShiftTimeOfDay(
  shift: Shift,
  categories: ShiftCategory[],
): NormalTimeOfDay | null {
  const category =
    categories.find(
      category =>
        category.id === shift.categoryId,
    )

  if (
    !category ||
    category.timeOfDay === 'none'
  ) {
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

export function getBalanceRangeShifts(
  shifts: Shift[],
  startDate: string,
  endDate: string,
): Shift[] {
  return shifts.filter(
    shift =>
      shift.date >= startDate &&
      shift.date <= endDate,
  )
}

export function getEmployeeBalancePenalty(
  employee: Employee,
  shifts: Shift[],
  context: SchedulerContext,
  startDate: string,
  endDate: string,
): number {
  const eligible =
    getEligibleTimeOfDays(
      employee,
      context,
    )

  if (eligible.length <= 1) {
    return 0
  }

  const balanceShifts =
    getBalanceRangeShifts(
      shifts,
      startDate,
      endDate,
    )

  const counts =
    getEmployeeTimeOfDayCounts(
      employee.id,
      balanceShifts,
      context.categories,
    )

  const relevantCounts =
    eligible.map(
      timeOfDay =>
        counts[timeOfDay],
    )

  const spread =
    Math.max(...relevantCounts) -
    Math.min(...relevantCounts)

  return spread * spread
}

export function getEmployeeBalanceState(
  employee: Employee,
  shifts: Shift[],
  context: SchedulerContext,
  startDate: string,
  endDate: string,
): EmployeeBalanceState | null {
  const eligible =
    getEligibleTimeOfDays(
      employee,
      context,
    )

  if (eligible.length <= 1) {
    return null
  }

  const balanceShifts =
    getBalanceRangeShifts(
      shifts,
      startDate,
      endDate,
    )

  const counts =
    getEmployeeTimeOfDayCounts(
      employee.id,
      balanceShifts,
      context.categories,
    )

  const values =
    eligible.map(
      timeOfDay => ({
        timeOfDay,
        count: counts[timeOfDay],
      }),
    )

  const highestCount =
    Math.max(
      ...values.map(
        value => value.count,
      ),
    )

  const lowestCount =
    Math.min(
      ...values.map(
        value => value.count,
      ),
    )

  return {
    spread:
      highestCount - lowestCount,

    highest:
      values
        .filter(
          value =>
            value.count === highestCount,
        )
        .map(
          value => value.timeOfDay,
        ),

    lowest:
      values
        .filter(
          value =>
            value.count === lowestCount,
        )
        .map(
          value => value.timeOfDay,
        ),
  }
}

export function getPairBalancePenalty(
  firstEmployee: Employee,
  secondEmployee: Employee,
  shifts: Shift[],
  context: SchedulerContext,
  startDate: string,
  endDate: string,
): number {
  return (
    getEmployeeBalancePenalty(
      firstEmployee,
      shifts,
      context,
      startDate,
      endDate,
    ) +
    getEmployeeBalancePenalty(
      secondEmployee,
      shifts,
      context,
      startDate,
      endDate,
    )
  )
}

export function simulateSwap(
  firstShift: Shift,
  secondShift: Shift,
  shifts: Shift[],
): Shift[] {
  if (
    firstShift.employeeId === null ||
    secondShift.employeeId === null
  ) {
    return shifts
  }

  const firstEmployeeId =
    firstShift.employeeId

  const secondEmployeeId =
    secondShift.employeeId

  return shifts.map(shift => {
    if (shift.id === firstShift.id) {
      return {
        ...shift,
        employeeId: secondEmployeeId,
      }
    }

    if (shift.id === secondShift.id) {
      return {
        ...shift,
        employeeId: firstEmployeeId,
      }
    }

    return shift
  })
}

export function getEmployeeSpread(
  employee: Employee,
  shifts: Shift[],
  context: SchedulerContext,
  startDate: string,
  endDate: string,
): number {
  return (
    getEmployeeBalanceState(
      employee,
      shifts,
      context,
      startDate,
      endDate,
    )?.spread ?? 0
  )
}

export function cloneContextForRebalance(
  context: SchedulerContext,
): SchedulerContext {
  return {
    ...context,

    generatedShifts:
      context.generatedShifts.map(
        shift => ({ ...shift }),
      ),

    workingShifts:
      context.workingShifts.map(
        shift => ({ ...shift }),
      ),
  }
}
