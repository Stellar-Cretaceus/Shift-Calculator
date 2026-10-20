
import type { Shift, ShiftCategory } from '@/lib/types'

/**
 * Normal automated time slots.
 *
 * These correspond to your Morning / Noon / Night categories.
 */
export type NormalTimeOfDay =
  | 'morning'
  | 'noon'
  | 'night'


/**
 * Find the category used by a shift.
 */
function findCategory(
  shift: Shift,
  categories: ShiftCategory[],
): ShiftCategory | undefined {
  return categories.find(
    category => category.id === shift.categoryId,
  )
}

/**
 * OFF and Vacation both mean the employee must rest
 * for the whole date.
 */
export function hasLockedRestOnDate(
  employeeId: number,
  date: string,
  existingShifts: Shift[],
  categories: ShiftCategory[],
): boolean {
  return existingShifts.some(shift => {
    if (
      shift.employeeId !== employeeId ||
      shift.date !== date
    ) {
      return false
    }

    const category = categories.find(
      category => category.id === shift.categoryId,
    )

    return (
      category?.type === 'vacation' ||
      category?.type === 'off'
    )
  })
}



/**
 * Returns true when this shift should be treated
 * as immutable by the automatic scheduler.
 *
 * For now:
 *
 * - Vacation = locked
 * - Special = locked
 * - OFF = locked
 *
 * Later, if normal manually-created shifts need an explicit
 * "locked" flag from the database, we can add that too.
 */
export function isLockedShift(
  shift: Shift,
  categories: ShiftCategory[],
): boolean {
  const category = findCategory(
    shift,
    categories,
  )

  if (!category) {
    return false
  }

  return (
    category.type === 'vacation' ||
    category.type === 'special' ||
    category.type === 'off'
  )
}


/**
 * A Vacation shift blocks ALL normal shifts
 * for the employee on that date.
 */
export function hasVacationOnDate(
  employeeId: number,
  date: string,
  existingShifts: Shift[],
  categories: ShiftCategory[],
): boolean {
  return existingShifts.some(shift => {
    if (
      shift.employeeId !== employeeId ||
      shift.date !== date
    ) {
      return false
    }

    const category = findCategory(
      shift,
      categories,
    )

    return category?.type === 'vacation'
  })
}


/**
 * Check whether a locked Special shift consumes
 * a particular normal time slot.
 *
 * Example:
 *
 * Seminar:
 *   type = special
 *   timeOfDay = morning
 *
 * Therefore the employee cannot also receive
 * a normal Morning shift on that day.
 */
export function isNormalSlotBlockedBySpecial(
  employeeId: number,
  date: string,
  timeOfDay: NormalTimeOfDay,
  existingShifts: Shift[],
  categories: ShiftCategory[],
): boolean {
  return existingShifts.some(shift => {
    if (
      shift.employeeId !== employeeId ||
      shift.date !== date
    ) {
      return false
    }

    const category = findCategory(
      shift,
      categories,
    )

    if (!category) {
      return false
    }

    return (
      category.type === 'special' &&
      category.timeOfDay === timeOfDay
    )
  })
}


/**
 * General helper used by canAssign().
 *
 * It answers:
 *
 * "Does an existing locked/manual shift prevent
 * this employee from taking this normal slot?"
 */
export function isBlockedByLockedShift(
  employeeId: number,
  date: string,
  timeOfDay: NormalTimeOfDay,
  existingShifts: Shift[],
  categories: ShiftCategory[],
): boolean {
  /**
   * Vacation blocks the whole day.
   */
  if (
  hasLockedRestOnDate(
    employeeId,
    date,
    existingShifts,
    categories,
  )
) {
  return true
}

  /**
   * Special only blocks its occupied time slot.
   */
  if (
    isNormalSlotBlockedBySpecial(
      employeeId,
      date,
      timeOfDay,
      existingShifts,
      categories,
    )
  ) {
    return true
  }

  return false
}

