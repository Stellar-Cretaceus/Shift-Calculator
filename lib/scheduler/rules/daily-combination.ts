
export type NormalTimeOfDay =
  | 'morning'
  | 'noon'
  | 'night'

/**
 * Every reason a same-day combination can fail.
 */
export type DailyCombinationRejectionReason =
  | 'DUPLICATE_TIME_OF_DAY'
  | 'TOO_MANY_NORMAL_SHIFTS'
  | 'NOON_NIGHT_COMBINATION'


/**
 * Result returned by the daily-combination checker.
 *
 * We return reasons instead of only true/false
 * so debugging stays easy later.
 */
export type DailyCombinationCheck = {
  allowed: boolean
  reasons: DailyCombinationRejectionReason[]
}


/**
 * Check whether adding one proposed normal shift
 * to the employee's existing normal shifts on the SAME DAY
 * creates an illegal combination.
 *
 * Example:
 *
 * existing = ['morning']
 * proposed = 'noon'
 *
 * => allowed
 *
 *
 * existing = ['noon']
 * proposed = 'night'
 *
 * => rejected
 */
export function checkDailyCombination(
  existingTimeOfDays: NormalTimeOfDay[],
  proposedTimeOfDay: NormalTimeOfDay,
): DailyCombinationCheck {
  const reasons: DailyCombinationRejectionReason[] = []


  // ---------------------------------------------------------
  // Rule 1:
  // Cannot have the same normal time slot twice.
  //
  // Example:
  //
  // Morning + Morning ❌
  // ---------------------------------------------------------

  if (
    existingTimeOfDays.includes(
      proposedTimeOfDay,
    )
  ) {
    reasons.push(
      'DUPLICATE_TIME_OF_DAY',
    )
  }


  // ---------------------------------------------------------
  // Rule 2:
  // Maximum two normal shifts per day.
  //
  // If the employee already has two normal shifts,
  // they cannot receive another one.
  // ---------------------------------------------------------

  if (existingTimeOfDays.length >= 2) {
    reasons.push(
      'TOO_MANY_NORMAL_SHIFTS',
    )
  }


  // ---------------------------------------------------------
  // Rule 3:
  // Noon + Night is forbidden.
  //
  // This works in either direction:
  //
  // existing Noon + proposed Night ❌
  //
  // existing Night + proposed Noon ❌
  // ---------------------------------------------------------

  const hasNoon =
    existingTimeOfDays.includes('noon') ||
    proposedTimeOfDay === 'noon'

  const hasNight =
    existingTimeOfDays.includes('night') ||
    proposedTimeOfDay === 'night'

  if (
    hasNoon &&
    hasNight
  ) {
    reasons.push(
      'NOON_NIGHT_COMBINATION',
    )
  }


  return {
    allowed: reasons.length === 0,
    reasons,
  }
}


/**
 * Convenience helper for places where
 * we only care about yes/no.
 */
export function isDailyCombinationAllowed(
  existingTimeOfDays: NormalTimeOfDay[],
  proposedTimeOfDay: NormalTimeOfDay,
): boolean {
  return checkDailyCombination(
    existingTimeOfDays,
    proposedTimeOfDay,
  ).allowed
}

