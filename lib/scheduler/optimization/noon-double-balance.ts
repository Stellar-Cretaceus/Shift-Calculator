import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'

import type {
  SchedulerContext,
} from '../context'

import type {
  ShiftBlock,
} from '../types'

import {
  canSwapGeneratedShifts,
  applyGeneratedShiftSwap,
} from './swap'

import {
  worsensTimeOfDayBalanceBeyondLimit,
  type NormalTimeOfDay,
} from '../scoring/category-balance'


const MAX_PASSES = 100


/**
 * Add calendar days.
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
 * Find category information.
 */
function findCategory(
  categoryId: number,
  categories: ShiftCategory[],
): ShiftCategory | undefined {

  return categories.find(
    category =>
      category.id === categoryId,
  )
}


/**
 * Convert a working category into its
 * Morning / Noon / Night bucket.
 *
 * Same convention as the rest of the scheduler:
 *
 * old Special + none
 *     -> Morning
 */
function getTimeOfDay(
  category:
    ShiftCategory | undefined,
): NormalTimeOfDay | null {

  if (!category) {
    return null
  }


  const isWork =
    category.type === 'regular' ||
    category.type === 'special'


  if (!isWork) {
    return null
  }


  if (
    category.type === 'special' &&
    category.timeOfDay === 'none'
  ) {
    return 'morning'
  }


  if (
    category.timeOfDay === 'morning' ||
    category.timeOfDay === 'noon' ||
    category.timeOfDay === 'night'
  ) {
    return category.timeOfDay
  }


  return null
}


/**
 * Build:
 *
 * date -> Set(Morning / Noon / Night)
 *
 * for ONE employee.
 *
 *
 * Example:
 *
 * 2026-11-10 -> { noon }
 *
 * 2026-11-11 -> {
 *   morning,
 *   noon,
 * }
 */
function getEmployeeDayMap(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): Map<
  string,
  Set<NormalTimeOfDay>
> {

  const result =
    new Map<
      string,
      Set<NormalTimeOfDay>
    >()


  for (const shift of shifts) {

    if (
      shift.employeeId !==
      employeeId
    ) {
      continue
    }


    const category =
      findCategory(
        shift.categoryId,
        categories,
      )


    const timeOfDay =
      getTimeOfDay(
        category,
      )


    if (!timeOfDay) {
      continue
    }


    let day =
      result.get(
        shift.date,
      )


    if (!day) {

      day =
        new Set<
          NormalTimeOfDay
        >()

      result.set(
        shift.date,
        day,
      )
    }


    day.add(
      timeOfDay,
    )
  }


  return result
}


/**
 * Count:
 *
 * Noon
 *   ↓ next day
 * Morning + Noon
 *
 *
 * Each occurrence = +1 penalty.
 */
function getEmployeeHarshPenalty(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {

  const days =
    getEmployeeDayMap(
      employeeId,
      shifts,
      categories,
    )


  let penalty = 0


  for (
    const [
      date,
      today,
    ]
    of days
  ) {

    /**
     * First day must contain Noon.
     */
    if (
      !today.has('noon')
    ) {
      continue
    }


    const tomorrowDate =
      addDays(
        date,
        1,
      )


    const tomorrow =
      days.get(
        tomorrowDate,
      )


    if (!tomorrow) {
      continue
    }


    /**
     * Tomorrow must be:
     *
     * Morning + Noon
     */
    if (
      tomorrow.has('morning') &&
      tomorrow.has('noon')
    ) {
      penalty++
    }
  }


  return penalty
}


/**
 * Which dates participate in the bad pattern?
 *
 * We use this to avoid blindly starting swaps
 * from every shift in the whole month.
 */
function getBadSequenceDates(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): Set<string> {

  const result =
    new Set<string>()


  const days =
    getEmployeeDayMap(
      employeeId,
      shifts,
      categories,
    )


  for (
    const [
      date,
      today,
    ]
    of days
  ) {

    if (
      !today.has('noon')
    ) {
      continue
    }


    const tomorrowDate =
      addDays(
        date,
        1,
      )


    const tomorrow =
      days.get(
        tomorrowDate,
      )


    if (
      tomorrow?.has('morning') &&
      tomorrow.has('noon')
    ) {

      /**
       * Both days are interesting swap sources.
       */
      result.add(
        date,
      )

      result.add(
        tomorrowDate,
      )
    }
  }


  return result
}


/**
 * Count double-shift DAYS for one employee.
 *
 * We use this as a safety objective:
 *
 * fixing the harsh sequence must not create
 * MORE doubles elsewhere.
 */
function getEmployeeDoubleDayCount(
  employeeId: number,
  shifts: Shift[],
  categories: ShiftCategory[],
): number {

  const days =
    getEmployeeDayMap(
      employeeId,
      shifts,
      categories,
    )


  let count = 0


  for (
    const timeOfDays
    of days.values()
  ) {

    if (
      timeOfDays.size >= 2
    ) {
      count++
    }
  }


  return count
}


/**
 * Only ordinary generated regular shifts
 * may be exchanged.
 *
 * Manual / locked shifts are not inside
 * generatedShifts anyway.
 *
 * Mandatory-generated shifts are explicitly protected.
 */
function isMovableShift(
  shift: Shift,
  context: SchedulerContext,
): boolean {

  if (
    shift.employeeId === null ||
    shift.roleId === null
  ) {
    return false
  }


  if (
    context
      .mandatoryGeneratedShiftIds
      .has(shift.id)
  ) {
    return false
  }


  const category =
    findCategory(
      shift.categoryId,
      context.categories,
    )


  return (
    category?.type ===
    'regular'
  )
}


/**
 * Simulate exchanging the employees assigned
 * to two slots.
 *
 * Nothing real is changed here.
 */
function simulateSwap(
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

    if (
      shift.id ===
      firstShift.id
    ) {
      return {
        ...shift,

        employeeId:
          secondEmployeeId,
      }
    }


    if (
      shift.id ===
      secondShift.id
    ) {
      return {
        ...shift,

        employeeId:
          firstEmployeeId,
      }
    }


    return shift
  })
}


/**
 * Total harsh-pattern penalty for ONLY the
 * two employees affected by a swap.
 *
 * We don't need to recount everybody because
 * nobody else's schedule changed.
 */
function getPairHarshPenalty(
  firstEmployeeId: number,
  secondEmployeeId: number,
  shifts: Shift[],
  context: SchedulerContext,
): number {

  return (
    getEmployeeHarshPenalty(
      firstEmployeeId,
      shifts,
      context.categories,
    ) +
    getEmployeeHarshPenalty(
      secondEmployeeId,
      shifts,
      context.categories,
    )
  )
}


/**
 * Same idea for double-shift days.
 */
function getPairDoubleCount(
  firstEmployeeId: number,
  secondEmployeeId: number,
  shifts: Shift[],
  context: SchedulerContext,
): number {

  return (
    getEmployeeDoubleDayCount(
      firstEmployeeId,
      shifts,
      context.categories,
    ) +
    getEmployeeDoubleDayCount(
      secondEmployeeId,
      shifts,
      context.categories,
    )
  )
}


/**
 * Soft cleanup optimizer.
 *
 *
 * Target pattern:
 *
 * Day X:
 *   Noon
 *
 * Day X+1:
 *   Morning + Noon
 *
 *
 * We try safe employee swaps until no further
 * improvement can be found.
 */
export function reduceNoonDoubleSequences(
  context: SchedulerContext,
  blocks: ShiftBlock[],
): void {

  let improved = true

  let passes = 0

  let acceptedSwaps = 0


  while (
    improved &&
    passes < MAX_PASSES
  ) {

    passes++

    improved = false


    // =======================================================
    // STEP 1 — Find movable assignments
    // =======================================================

    const movableShifts =
      context.generatedShifts.filter(
        shift =>
          isMovableShift(
            shift,
            context,
          ),
      )


    // =======================================================
    // STEP 2 — Find employees who actually have
    //          the harsh pattern
    // =======================================================

    const badDatesByEmployee =
      new Map<
        number,
        Set<string>
      >()


    for (
      const employee
      of context.employees
    ) {

      const badDates =
        getBadSequenceDates(
          employee.id,
          context.workingShifts,
          context.categories,
        )


      if (
        badDates.size > 0
      ) {
        badDatesByEmployee.set(
          employee.id,
          badDates,
        )
      }
    }


    /**
     * Nothing bad remains.
     */
    if (
      badDatesByEmployee.size === 0
    ) {
      break
    }


    // =======================================================
    // STEP 3 — Only start from shifts that are actually
    //          involved in a bad pattern
    // =======================================================

    const sourceShifts =
      movableShifts.filter(
        shift => {

          if (
            shift.employeeId === null
          ) {
            return false
          }


          const badDates =
            badDatesByEmployee.get(
              shift.employeeId,
            )


          return (
            badDates?.has(
              shift.date,
            ) ?? false
          )
        },
      )


    // =======================================================
    // STEP 4 — Try safe swaps
    // =======================================================

    for (
      const firstShift
      of sourceShifts
    ) {

      if (
        firstShift.employeeId === null
      ) {
        continue
      }


      for (
        const secondShift
        of movableShifts
      ) {

        if (
          secondShift.employeeId === null
        ) {
          continue
        }


        if (
          firstShift.id ===
          secondShift.id
        ) {
          continue
        }


        if (
          firstShift.employeeId ===
          secondShift.employeeId
        ) {
          continue
        }


        const firstEmployeeId =
          firstShift.employeeId

        const secondEmployeeId =
          secondShift.employeeId


        // ===================================================
        // HARD RULE SAFETY
        // ===================================================

        const swapCheck =
          canSwapGeneratedShifts(
            firstShift,
            secondShift,
            blocks,
            context,
          )


        if (!swapCheck.allowed) {
          continue
        }


        // ===================================================
        // SIMULATE
        // ===================================================

        const simulatedShifts =
          simulateSwap(
            firstShift,
            secondShift,
            context.workingShifts,
          )


        // ===================================================
        // CATEGORY BALANCE SAFETY
        // ===================================================

        const firstBalanceWorsened =
          worsensTimeOfDayBalanceBeyondLimit(
            firstEmployeeId,
            context.workingShifts,
            simulatedShifts,
            context.categories,
          )


        const secondBalanceWorsened =
          worsensTimeOfDayBalanceBeyondLimit(
            secondEmployeeId,
            context.workingShifts,
            simulatedShifts,
            context.categories,
          )


        if (
          firstBalanceWorsened ||
          secondBalanceWorsened
        ) {
          continue
        }


        // ===================================================
        // SOFT OBJECTIVE
        //
        // The harsh pattern MUST actually decrease.
        // ===================================================

        const beforePenalty =
          getPairHarshPenalty(
            firstEmployeeId,
            secondEmployeeId,
            context.workingShifts,
            context,
          )


        const afterPenalty =
          getPairHarshPenalty(
            firstEmployeeId,
            secondEmployeeId,
            simulatedShifts,
            context,
          )


        if (
          afterPenalty >=
          beforePenalty
        ) {
          continue
        }


        // ===================================================
        // DOUBLE-SHIFT SAFETY
        //
        // Don't fix Noon -> Morning+Noon by simply
        // creating even more double-shift days.
        // ===================================================

        const beforeDoubleCount =
          getPairDoubleCount(
            firstEmployeeId,
            secondEmployeeId,
            context.workingShifts,
            context,
          )


        const afterDoubleCount =
          getPairDoubleCount(
            firstEmployeeId,
            secondEmployeeId,
            simulatedShifts,
            context,
          )


        if (
          afterDoubleCount >
          beforeDoubleCount
        ) {
          continue
        }


        // ===================================================
        // ACCEPT
        // ===================================================

        applyGeneratedShiftSwap(
          firstShift,
          secondShift,
          context,
        )


        acceptedSwaps++


        console.log(
          '[noon-double] swap accepted',
          {
            firstShiftId:
              firstShift.id,

            secondShiftId:
              secondShift.id,

            employees: [
              firstEmployeeId,
              secondEmployeeId,
            ],

            beforePenalty,
            afterPenalty,

            beforeDoubleCount,
            afterDoubleCount,
          },
        )


        /**
         * Schedule changed.
         *
         * Restart from scratch so all penalties
         * are recalculated from the new schedule.
         */
        improved = true

        break
      }


      if (improved) {
        break
      }
    }
  }


  // =========================================================
  // Final diagnostic
  // =========================================================

  const remainingPenalty =
    context.employees.reduce(
      (
        total,
        employee,
      ) =>
        total +
        getEmployeeHarshPenalty(
          employee.id,
          context.workingShifts,
          context.categories,
        ),
      0,
    )


  console.log(
    '[noon-double] finished',
    {
      passes,
      acceptedSwaps,
      remainingPenalty,
    },
  )
}