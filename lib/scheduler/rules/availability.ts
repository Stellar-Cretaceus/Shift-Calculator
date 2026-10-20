import type { EmployeeTitle } from '@/lib/types'

/**
 * Convert a string such as:
 *
 *   "1,2,3,4,5"
 *
 * into:
 *
 *   [1, 2, 3, 4, 5]
 *
 * Day convention:
 *
 *   0 = Sunday
 *   1 = Monday
 *   ...
 *   6 = Saturday
 */
export function parseCustomDays(
  customDays: string,
): number[] {
  if (!customDays?.trim()) {
    return []
  }

  return customDays
    .split(',')
    .map(day => Number(day.trim()))
    .filter(day =>
      Number.isInteger(day) &&
      day >= 0 &&
      day <= 6
    )
}


/**
 * Return the weekdays on which this Title/Rank
 * normally works.
 *
 * OFFICIAL
 * --------
 * Monday-Friday.
 *
 * SHIFT
 * -----
 * Uses customDays when defined.
 *
 * In your current data this is normally:
 *
 *   "0,1,2,3,4,5,6"
 *
 * If no days are stored, we preserve the old behaviour
 * and assume all seven days.
 *
 * CUSTOM
 * ------
 * Uses customDays directly.
 */
export function getAllowedDaysForTitle(
  title: EmployeeTitle,
): number[] {
  switch (title.workingTimePattern) {
    case 'official':
      return [1, 2, 3, 4, 5]

    case 'shift': {
      const days = parseCustomDays(
        title.customDays,
      )

      return days.length > 0
        ? days
        : [0, 1, 2, 3, 4, 5, 6]
    }

    case 'custom':
      return parseCustomDays(
        title.customDays,
      )

    default:
      /**
       * TypeScript should normally prevent us
       * from ever reaching this.
       *
       * Returning [] is safer than accidentally
       * scheduling somebody with unknown rules.
       */
      return []
  }
}


/**
 * Convert our YYYY-MM-DD date into weekday number.
 *
 * Example:
 *
 * 2026-09-28 -> Monday -> 1
 */
export function getDayOfWeek(
  date: string,
): number {
  return new Date(
    `${date}T00:00:00`,
  ).getDay()
}


/**
 * HARD RULE:
 *
 * Is this Title/Rank normally available on this date?
 *
 * `isHoliday` is supplied separately because the scheduler
 * will eventually have the Holiday table in its context.
 */
export function isTitleAvailableOnDate(
  title: EmployeeTitle,
  date: string,
  isHoliday: boolean,
): boolean {
  /**
   * Some titles are allowed to rest on holidays.
   *
   * If this is a holiday and their title says
   * restOnHoliday = true, they are unavailable.
   */
  if (
    isHoliday &&
    title.restOnHoliday
  ) {
    return false
  }

  const dayOfWeek =
    getDayOfWeek(date)

  const allowedDays =
    getAllowedDaysForTitle(title)

  return allowedDays.includes(
    dayOfWeek,
  )
}


/**
 * This is NOT another legality rule.
 *
 * It answers:
 *
 * "If this person IS available today,
 *  should the generator prioritize assigning them?"
 *
 * We'll use this later in mandatory.ts.
 */
export function isMandatoryWorkDate(
  title: EmployeeTitle,
  date: string,
  isHoliday: boolean,
): boolean {
  if (!title.mustWorkAllAvailable) {
    return false
  }

  return isTitleAvailableOnDate(
    title,
    date,
    isHoliday,
  )
}