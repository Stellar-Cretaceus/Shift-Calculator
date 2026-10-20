'use server'

import { db } from '@/lib/db'

import {
  shifts,
} from '@/lib/db/schema'

import {
  getUserId,
} from '@/lib/session'

import {
  generateBestSchedule,
} from '@/lib/scheduler'


import {
  and,
  asc,
  eq,
  gte,
  lte,
} from 'drizzle-orm'

import {
  revalidatePath,
} from 'next/cache'

import type {
  Shift,
} from '@/lib/types'

import {
  prepareSchedulerData,
} from '@/lib/scheduler/server/prepareSchedulerData'

import {
  createSchedulerContext,
} from '@/lib/scheduler/context'

import {
  buildRequirements,
} from '@/lib/scheduler/generation/buildRequirements'

import {
  getDatesInRange,
} from '@/lib/scheduler/date/dates'

import {
  validateSchedule,
} from '@/lib/scheduler/validation/validateSchedule'




/**
 * Pure sandbox generator.
 *
 * Loads prepared scheduler data,
 * generates a preview,
 * and returns it to the frontend.
 *
 * Nothing is written to the database.
 */
export async function generateRange(
  startDateStr: string,
  endDateStr: string,
  clientBufferedShifts?: any[],
) {

  // =========================================================
  // STEP 1 — Prepare scheduler data
  // =========================================================

  const {
    templates,
    schedulerEmployees,
    schedulerTitles,
    schedulerCategories,
    workingShifts,
    lockedShifts,
    holidayDates,
    pairRoles,
    compatibilityRows,
  } =
    await prepareSchedulerData(
      startDateStr,
      endDateStr,
      clientBufferedShifts,
    )


  // =========================================================
  // STEP 2 — Debug snapshot
  // =========================================================

  console.log(
    '[schedule] generating',
    {
      range:
        `${startDateStr} -> ${endDateStr}`,

      employees:
        schedulerEmployees.length,

      titles:
        schedulerTitles.length,

      templates:
        templates.length,

      categories:
        schedulerCategories.length,

      existingShifts:
        workingShifts.length,

      lockedShifts:
        lockedShifts.length,

      compatibilityRows:
        compatibilityRows.length,

      pairRoles,
    },
  )


  // =========================================================
  // STEP 3 — Generate
  // =========================================================

  const result =
    generateBestSchedule({
      startDate:
        startDateStr,

      endDate:
        endDateStr,

      employees:
        schedulerEmployees,

      titles:
        schedulerTitles,

      templates,

      categories:
        schedulerCategories,

      existingShifts:
        workingShifts,

      lockedShifts,

      holidayDates,

      pairRoles,
    })


  console.log(
    '[schedule] generation complete',
    {
      seed:
        result.seed,

      generated:
        result.totalGenerated,

      unfilled:
        result.unfilledCount,
    },
  )


  // =========================================================
  // STEP 4 — Frontend result
  // =========================================================

  return {
    shifts:
      result.shifts,

    total:
      result.totalGenerated,

    open:
      result.unfilledCount,

    resolvedLockedRoles:
      result.resolvedLockedRoles,
  }
}

/**
 * Validate the current unsaved frontend schedule buffer.
 *
 * This does NOT:
 *
 * - generate shifts
 * - change shifts
 * - save anything
 *
 * It only returns hard-rule violations.
 */
export async function validateBufferedRange(
  startDateStr: string,
  endDateStr: string,
  bufferedShifts: Shift[],
) {

  // =========================================================
  // STEP 1 — Prepare the SAME scheduler data generation uses
  // =========================================================

  const {
    templates,
    schedulerEmployees,
    schedulerTitles,
    schedulerCategories,
    workingShifts,
    lockedShifts,
    holidayDates,
    pairRoles,
  } =
    await prepareSchedulerData(
      startDateStr,
      endDateStr,
      bufferedShifts,
    )


  // =========================================================
  // STEP 2 — Build scheduler context
  // =========================================================

  const context =
    createSchedulerContext({
      employees:
        schedulerEmployees,

      titles:
        schedulerTitles,

      categories:
        schedulerCategories,

      existingShifts:
        workingShifts,

      lockedShifts,

      holidayDates,

      pairRoles,

      /**
       * Validation has no random choices,
       * but SchedulerContext requires an RNG.
       */
      random:
        () => 0.5,

      seed:
        0,
    })


  // =========================================================
  // STEP 3 — Rebuild configured shift blocks
  // =========================================================

  const dates =
    getDatesInRange(
      startDateStr,
      endDateStr,
    )


  const blocks =
    buildRequirements(
      templates,
      dates,
    )


  // =========================================================
  // STEP 4 — Validate
  // =========================================================

  const violations =
    validateSchedule(
      context,
      blocks,
    )


  return {
    violations,
  }
}

export async function commitBufferedShifts(
  startDateStr: string,
  endDateStr: string,
  shiftsList: any[],
) {
  const userId =
    await getUserId()

  await db
    .delete(shifts)
    .where(
      and(
        eq(
          shifts.userId,
          userId,
        ),
        gte(
          shifts.date,
          startDateStr,
        ),
        lte(
          shifts.date,
          endDateStr,
        ),
      ),
    )


  if (shiftsList.length > 0) {
    await db
      .insert(shifts)
      .values(
        shiftsList.map(
          shift => ({
            userId,

            locationId:
              shift.locationId,

            roleId:
              shift.roleId,

            employeeId:
              shift.employeeId,

            date:
              shift.date,

            categoryId:
              shift.categoryId,
          }),
        ),
      )
  }


  revalidatePath('/')

  return {
    success: true,
  }
}


export async function getShiftsForRange(startDateStr: string, endDateStr: string) {
  const userId = await getUserId()

  return db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        gte(shifts.date, startDateStr),
        lte(shifts.date, endDateStr),
      ),
    )
    .orderBy(asc(shifts.date))
}

export async function assignShift(shiftId: number, employeeId: number | null) {
  const userId = await getUserId()
  await db
    .update(shifts)
    .set({ employeeId })
    .where(and(eq(shifts.id, shiftId), eq(shifts.userId, userId)))
  revalidatePath('/')
}

export async function deleteShift(id: number) {
  const userId = await getUserId()
  await db.delete(shifts).where(
    and(
      eq(shifts.id, id), 
      eq(shifts.userId, userId)
    )
  )
  revalidatePath('/')
}

export async function clearRange(startDateStr: string, endDateStr: string) {
  const userId = await getUserId()
  await db
    .delete(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        gte(shifts.date, startDateStr),
        lte(shifts.date, endDateStr),
      ),
    )
  revalidatePath('/')
}

export async function createShift(input: {
  locationId: number
  roleId: number | null      
  employeeId: number | null
  date: string
  categoryId: number
}) {
  const userId = await getUserId()
  await db.insert(shifts).values({
    userId,
    ...input
  })
  revalidatePath('/')
}