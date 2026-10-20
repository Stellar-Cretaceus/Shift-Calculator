import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'


export type DoubleShiftScore = {
  score: number
  doubleShiftDayCount: number
}


function findCategory(
  categoryId: number,
  categories: ShiftCategory[],
): ShiftCategory | undefined {
  return categories.find(
    category => category.id === categoryId,
  )
}


function isWorkingShift(
  shift: Shift,
  categories: ShiftCategory[],
): boolean {
  const category =
    findCategory(
      shift.categoryId,
      categories,
    )

  return (
    category?.type === 'regular' ||
    category?.type === 'special'
  )
}


/**
 * Count how many dates this employee has exactly
 * two work assignments.
 *
 * Example:
 *
 * Oct 1:
 * Morning + Noon
 * => double-shift day
 *
 * Oct 2:
 * Morning
 * => not double
 *
 * Oct 3:
 * Morning + Night
 * => double-shift day
 *
 * result = 2
 */
export function countDoubleShiftDays(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {
  const shiftsPerDate =
    new Map<string, number>()


  for (const shift of shifts) {
    if (
      shift.employeeId !== employeeId
    ) {
      continue
    }

    if (
      !isWorkingShift(
        shift,
        categories,
      )
    ) {
      continue
    }


    const current =
      shiftsPerDate.get(
        shift.date,
      ) ?? 0


    shiftsPerDate.set(
      shift.date,
      current + 1,
    )
  }


  let doubleShiftDayCount = 0


  for (
    const count
    of shiftsPerDate.values()
  ) {
    if (count >= 2) {
      doubleShiftDayCount++
    }
  }


  return doubleShiftDayCount
}


/**
 * Lower score = better candidate.
 */
export function scoreDoubleShift(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): DoubleShiftScore {
  const doubleShiftDayCount =
    countDoubleShiftDays(
      employeeId,
      shifts,
      categories,
    )

  return {
    score:
      doubleShiftDayCount,

    doubleShiftDayCount,
  }
}