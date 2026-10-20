export type NormalTimeOfDay =
  | 'morning'
  | 'noon'
  | 'night'

export type SequenceRejectionReason =
  | 'NIGHT_BEFORE_MORNING'

export type SequenceCheck = {
  allowed: boolean
  reasons: SequenceRejectionReason[]
}

/**
 * Checks whether a proposed shift creates an illegal
 * sequence with the previous or next day.
 *
 * Example:
 *
 * Yesterday:
 *   Night
 *
 * Proposed today:
 *   Morning
 *
 * => rejected
 *
 *
 * Or:
 *
 * Proposed today:
 *   Night
 *
 * Tomorrow:
 *   Morning
 *
 * => rejected
 */
export function checkShiftSequence(
  previousDayTimeOfDays: NormalTimeOfDay[],
  proposedTimeOfDay: NormalTimeOfDay,
  nextDayTimeOfDays: NormalTimeOfDay[],
): SequenceCheck {
  const reasons: SequenceRejectionReason[] = []

  // ---------------------------------------------------------
  // Rule 1:
  // Yesterday Night -> Today Morning is forbidden.
  // ---------------------------------------------------------

  const previousDayHasNight =
    previousDayTimeOfDays.includes('night')

  if (
    previousDayHasNight &&
    proposedTimeOfDay === 'morning'
  ) {
    reasons.push('NIGHT_BEFORE_MORNING')
  }

  // ---------------------------------------------------------
  // Rule 2:
  // Today Night -> Tomorrow Morning is also forbidden.
  //
  // We check this direction too because tomorrow might
  // already contain a locked/manual Morning shift.
  // ---------------------------------------------------------

  const nextDayHasMorning =
    nextDayTimeOfDays.includes('morning')

  if (
    proposedTimeOfDay === 'night' &&
    nextDayHasMorning
  ) {
    /**
     * Avoid inserting the same reason twice.
     */
    if (
      !reasons.includes(
        'NIGHT_BEFORE_MORNING',
      )
    ) {
      reasons.push(
        'NIGHT_BEFORE_MORNING',
      )
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  }
}

/**
 * Convenience version when we only need true/false.
 */
export function isShiftSequenceAllowed(
  previousDayTimeOfDays: NormalTimeOfDay[],
  proposedTimeOfDay: NormalTimeOfDay,
  nextDayTimeOfDays: NormalTimeOfDay[],
): boolean {
  return checkShiftSequence(
    previousDayTimeOfDays,
    proposedTimeOfDay,
    nextDayTimeOfDays,
  ).allowed
}

