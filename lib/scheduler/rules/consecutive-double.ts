import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'


export type ConsecutiveDoubleCheck = {
  allowed: boolean
}


/**
 * Count actual WORK shifts on one day.
 *
 * Work:
 * - regular
 * - special
 *
 * Not work:
 * - vacation
 * - off
 */
function countWorkShiftsOnDate(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {

  return shifts.filter(shift => {

    if (
      shift.employeeId !== employeeId ||
      shift.date !== date
    ) {
      return false
    }


    const category =
      categories.find(
        category =>
          category.id === shift.categoryId,
      )


    if (!category) {
      return false
    }


    return (
      category.type === 'regular' ||
      category.type === 'special'
    )
  }).length
}


/**
 * Prevent double shifts on two consecutive days.
 *
 * Example:
 *
 * Oct 10:
 * Morning + Noon
 *
 * Oct 11:
 * Morning + Noon
 *
 * ❌ Not allowed
 *
 *
 * IMPORTANT:
 *
 * `existingShifts` does NOT yet contain the proposed shift.
 *
 * So:
 *
 * todayWorkCount + 1
 *
 * represents what today's count WOULD become.
 */
export function checkConsecutiveDouble(
  employeeId: number,
  date: string,
  previousDate: string,
  nextDate: string,
  existingShifts: Shift[],
  categories: ShiftCategory[],
): ConsecutiveDoubleCheck {

  const todayCount =
    countWorkShiftsOnDate(
      employeeId,
      date,
      existingShifts,
      categories,
    )


  /**
   * The proposed assignment would NOT create
   * a double-shift day.
   *
   * Example:
   *
   * todayCount = 0
   * proposed shift makes it 1
   *
   * No problem.
   */
  if (todayCount + 1 < 2) {
    return {
      allowed: true,
    }
  }


  const previousCount =
    countWorkShiftsOnDate(
      employeeId,
      previousDate,
      existingShifts,
      categories,
    )


  if (previousCount >= 2) {
    return {
      allowed: false,
    }
  }


  const nextCount =
    countWorkShiftsOnDate(
      employeeId,
      nextDate,
      existingShifts,
      categories,
    )


  if (nextCount >= 2) {
    return {
      allowed: false,
    }
  }


  return {
    allowed: true,
  }
}