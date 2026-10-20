import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'


export type FatigueRejectionReason =
  | 'REST_REQUIRED'
  | 'REST_REQUIRED_BEFORE_LOCKED_WORK'


export type FatigueCheck = {
  allowed: boolean
  reasons: FatigueRejectionReason[]

  /**
   * Useful for debugging.
   *
   * Example:
   * 6 means the employee currently has 6 shifts
   * since their last rest.
   */
  currentShiftCount: number

  /**
   * Count if we add the proposed shift.
   */
  proposedShiftCount: number
}


const MAX_SHIFTS_BEFORE_REST = 7


/**
 * Local date helper.
 *
 * addDays('2026-10-01', -1)
 * -> '2026-09-30'
 */
function addDays(
  date: string,
  amount: number,
): string {
  const value =
    new Date(`${date}T00:00:00`)

  value.setDate(
    value.getDate() + amount,
  )

  const year =
    value.getFullYear()

  const month =
    String(
      value.getMonth() + 1,
    ).padStart(2, '0')

  const day =
    String(
      value.getDate(),
    ).padStart(2, '0')

  return `${year}-${month}-${day}`
}


/**
 * Find the category belonging to a shift.
 */
function findCategory(
  shift: Shift,
  categories: ShiftCategory[],
): ShiftCategory | undefined {
  return categories.find(
    category =>
      category.id === shift.categoryId,
  )
}


/**
 * Does this category represent actual work?
 *
 * Regular:
 * Morning / Noon / Night
 *
 * Special:
 * Seminar, etc.
 *
 * Both count toward the 7-shift threshold.
 */
function isWorkingCategory(
  category: ShiftCategory | undefined,
): boolean {
  return (
    category?.type === 'regular' ||
    category?.type === 'special'
  )
}


/**
 * Does this category explicitly represent rest?
 *
 * Both OFF and Vacation reset fatigue.
 */
function isRestCategory(
  category: ShiftCategory | undefined,
): boolean {
  return (
    category?.type === 'off' ||
    category?.type === 'vacation'
  )
}


/**
 * Count how many actual work shifts an employee
 * has on one date.
 *
 * Morning + Noon -> 2
 * Morning only   -> 1
 * Vacation       -> 0
 */
export function countWorkingShiftsOnDate(
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

    return isWorkingCategory(
      findCategory(
        shift,
        categories,
      ),
    )
  }).length
}


/**
 * Explicit OFF or Vacation.
 */
export function hasExplicitRestOnDate(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): boolean {
  return shifts.some(shift => {
    if (
      shift.employeeId !== employeeId ||
      shift.date !== date
    ) {
      return false
    }

    return isRestCategory(
      findCategory(
        shift,
        categories,
      ),
    )
  })
}


/**
 * Count shifts since the most recent rest day,
 * looking BACKWARD from the proposed date.
 *
 *
 * Important:
 *
 * A date with ZERO work is a natural rest day.
 *
 * So:
 *
 * Monday    Morning
 * Tuesday   Morning
 * Wednesday nothing
 * Thursday  Morning
 *
 * Thursday's current streak starts after Wednesday.
 */
export function countShiftsSinceLastRest(
  employeeId: number,
  proposedDate: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {
  let count = 0

  let date =
    addDays(
      proposedDate,
      -1,
    )

  while (true) {

    /**
     * Explicit OFF/Vacation resets immediately.
     */
    if (
      hasExplicitRestOnDate(
        employeeId,
        date,
        shifts,
        categories,
      )
    ) {
      break
    }

    const shiftsOnDate =
      countWorkingShiftsOnDate(
        employeeId,
        date,
        shifts,
        categories,
      )

    /**
     * No work on this calendar date means
     * natural rest.
     */
    if (shiftsOnDate === 0) {
      break
    }

    count += shiftsOnDate

    /**
     * We already know we've reached the threshold.
     *
     * No need to scan farther backwards.
     */
    if (
      count >= MAX_SHIFTS_BEFORE_REST
    ) {
      break
    }

    date =
      addDays(
        date,
        -1,
      )
  }

  return count
}


/**
 * Check future LOCKED work.
 *
 * Why?
 *
 * Suppose:
 *
 * Current streak = 6
 *
 * Today:
 * proposed Morning -> shift #7
 *
 * Tomorrow:
 * LOCKED Morning
 *
 * If we accept today, tomorrow becomes shift #8.
 *
 * But tomorrow cannot be removed because it is locked.
 *
 * Therefore today must remain a rest day.
 */
function futureLockedWorkWouldBreakRule(
  employeeId: number,
  proposedDate: string,
  countAfterProposal: number,
  lockedShifts: Shift[],
  categories: ShiftCategory[],
): boolean {
  let projectedCount =
    countAfterProposal

  let date =
    addDays(
      proposedDate,
      1,
    )

  while (true) {

    /**
     * Locked OFF/Vacation guarantees rest,
     * so the future streak safely resets.
     */
    if (
      hasExplicitRestOnDate(
        employeeId,
        date,
        lockedShifts,
        categories,
      )
    ) {
      return false
    }


    const lockedWorkCount =
      countWorkingShiftsOnDate(
        employeeId,
        date,
        lockedShifts,
        categories,
      )


    /**
     * No locked work on this date means the generator
     * still has the OPTION to give this employee a rest day.
     *
     * Therefore we don't need to reject today's assignment.
     */
    if (lockedWorkCount === 0) {
      return false
    }


    projectedCount +=
      lockedWorkCount


    if (
      projectedCount >
      MAX_SHIFTS_BEFORE_REST
    ) {
      return true
    }


    date =
      addDays(
        date,
        1,
      )
  }
}


/**
 * Main fatigue / required-rest hard rule.
 *
 * `workingShifts`
 * = every shift currently known to the scheduler
 *
 * `lockedShifts`
 * = assignments which absolutely cannot be moved
 *
 *
 * The proposed assignment itself is NOT yet inside
 * workingShifts, so we add +1 manually.
 */
export function checkFatigueRule(
  employeeId: number,
  proposedDate: string,
  workingShifts: Shift[],
  lockedShifts: Shift[],
  categories: ShiftCategory[],
): FatigueCheck {
  const reasons: FatigueRejectionReason[] = []


  // ---------------------------------------------------------
  // Count previous consecutive workload
  // ---------------------------------------------------------

  const previousCount =
    countShiftsSinceLastRest(
      employeeId,
      proposedDate,
      workingShifts,
      categories,
    )


  /**
   * Employee might already have one normal shift
   * today and we're considering a second one.
   *
   * Double shift therefore correctly counts as +2.
   */
  const todayCount =
    countWorkingShiftsOnDate(
      employeeId,
      proposedDate,
      workingShifts,
      categories,
    )


  const currentShiftCount =
    previousCount + todayCount


  /**
   * Proposed shift itself = +1.
   */
  const proposedShiftCount =
    currentShiftCount + 1


  // ---------------------------------------------------------
  // Hard threshold
  // ---------------------------------------------------------

  if (
    proposedShiftCount >
    MAX_SHIFTS_BEFORE_REST
  ) {
    reasons.push(
      'REST_REQUIRED',
    )

    return {
      allowed: false,
      reasons,
      currentShiftCount,
      proposedShiftCount,
    }
  }


  // ---------------------------------------------------------
  // Future locked-work safety
  // ---------------------------------------------------------

  if (
    futureLockedWorkWouldBreakRule(
      employeeId,
      proposedDate,
      proposedShiftCount,
      lockedShifts,
      categories,
    )
  ) {
    reasons.push(
      'REST_REQUIRED_BEFORE_LOCKED_WORK',
    )
  }


  return {
    allowed:
      reasons.length === 0,

    reasons,

    currentShiftCount,
    proposedShiftCount,
  }
}

/**
 * Validate the COMPLETE fatigue streak around one date.
 *
 * Unlike checkFatigueRule(), this is for an already-built
 * or simulated schedule.
 *
 * It scans BOTH directions because optimizers may move
 * assignments backward or forward in time.
 */
export function hasFatigueViolationAroundDate(
  employeeId: number,
  date: string,
  shifts: Shift[],
  categories: ShiftCategory[],
): boolean {

  let totalWorkShifts = 0


  // =========================================================
  // Scan backward, INCLUDING the target date
  // =========================================================

  let backwardDate =
    date


  while (true) {

    if (
      hasExplicitRestOnDate(
        employeeId,
        backwardDate,
        shifts,
        categories,
      )
    ) {
      break
    }


    const workCount =
      countWorkingShiftsOnDate(
        employeeId,
        backwardDate,
        shifts,
        categories,
      )


    /**
     * Empty calendar day = natural rest.
     */
    if (workCount === 0) {
      break
    }


    totalWorkShifts +=
      workCount


    if (
      totalWorkShifts >
      MAX_SHIFTS_BEFORE_REST
    ) {
      return true
    }


    backwardDate =
      addDays(
        backwardDate,
        -1,
      )
  }


  // =========================================================
  // Scan forward, starting AFTER the target date
  // =========================================================

  let forwardDate =
    addDays(
      date,
      1,
    )


  while (true) {

    if (
      hasExplicitRestOnDate(
        employeeId,
        forwardDate,
        shifts,
        categories,
      )
    ) {
      break
    }


    const workCount =
      countWorkingShiftsOnDate(
        employeeId,
        forwardDate,
        shifts,
        categories,
      )


    if (workCount === 0) {
      break
    }


    totalWorkShifts +=
      workCount


    if (
      totalWorkShifts >
      MAX_SHIFTS_BEFORE_REST
    ) {
      return true
    }


    forwardDate =
      addDays(
        forwardDate,
        1,
      )
  }


  return false
}