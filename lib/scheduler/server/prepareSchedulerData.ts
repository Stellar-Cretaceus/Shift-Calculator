import 'server-only'

import { db } from '@/lib/db'

import {
  employees,
  employeeTitles,
  titlePermissions,
  employeeRoleOverrides,
  availability,
  shiftTemplates,
  shifts,
  holidays,
  shiftCategories,
  titleAllowedLocations,
  titleAllowedCategories,
  titleCompatibleTitles,
  roles,
} from '@/lib/db/schema'

import {
  and,
  eq,
  gte,
  lte,
} from 'drizzle-orm'

import {
  getUserId,
} from '@/lib/session'

import type {
  ShiftCategory,
} from '@/lib/types'


/**
 * Load + convert all database data required
 * by the scheduler.
 *
 * Both generation and validation will use this.
 */
export async function prepareSchedulerData(
  startDateStr: string,
  endDateStr: string,
  clientBufferedShifts?: any[],
) {

  const userId =
    await getUserId()


  // =========================================================
  // STEP 1 — Calculate history lookback
  // =========================================================

  /**
   * Fatigue and sequence rules need some history
   * before the requested range.
   */
  const historyStart =
    new Date(
      `${startDateStr}T00:00:00`,
    )

  historyStart.setDate(
    historyStart.getDate() - 7,
  )


  const historyYear =
    historyStart.getFullYear()

  const historyMonth =
    String(
      historyStart.getMonth() + 1,
    ).padStart(2, '0')

  const historyDay =
    String(
      historyStart.getDate(),
    ).padStart(2, '0')


  const fetchStartStr =
    `${historyYear}-${historyMonth}-${historyDay}`


  // =========================================================
  // STEP 2 — Load DB data
  // =========================================================

  const [
    templates,
    emps,
    perms,
    overrides,
    avail,
    holidayData,
    categoriesData,
    currentShifts,
    titleLocs,
    titleCats,
    titles,
    compatibilityRows,
    rolesData,
  ] = await Promise.all([

    db
      .select()
      .from(shiftTemplates)
      .where(
        eq(
          shiftTemplates.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(employees)
      .where(
        eq(
          employees.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(titlePermissions)
      .where(
        eq(
          titlePermissions.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(employeeRoleOverrides)
      .where(
        eq(
          employeeRoleOverrides.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(availability)
      .where(
        eq(
          availability.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(holidays)
      .where(
        and(
          gte(
            holidays.date,
            startDateStr,
          ),

          lte(
            holidays.date,
            endDateStr,
          ),
        ),
      ),

    db
      .select()
      .from(shiftCategories)
      .where(
        eq(
          shiftCategories.userId,
          userId,
        ),
      ),

    /**
     * History + current range.
     */
    db
      .select()
      .from(shifts)
      .where(
        and(
          eq(
            shifts.userId,
            userId,
          ),

          gte(
            shifts.date,
            fetchStartStr,
          ),

          lte(
            shifts.date,
            endDateStr,
          ),
        ),
      ),

    db
      .select()
      .from(titleAllowedLocations)
      .where(
        eq(
          titleAllowedLocations.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(titleAllowedCategories)
      .where(
        eq(
          titleAllowedCategories.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(employeeTitles)
      .where(
        eq(
          employeeTitles.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(titleCompatibleTitles)
      .where(
        eq(
          titleCompatibleTitles.userId,
          userId,
        ),
      ),

    db
      .select()
      .from(roles)
      .where(
        eq(
          roles.userId,
          userId,
        ),
      ),
  ])


  // =========================================================
  // STEP 3 — Basic configuration validation
  // =========================================================

  if (templates.length === 0) {
    throw new Error(
      'Add at least one shift rule before generating a schedule.',
    )
  }


  // =========================================================
  // STEP 4 — Find pair-role IDs
  // =========================================================

  const inChargeRole =
    rolesData.find(
      role =>
        role.name
          .trim()
          .toLowerCase() ===
        'in charge',
    )


  const memberRole =
    rolesData.find(
      role =>
        role.name
          .trim()
          .toLowerCase() ===
        'member',
    )


  if (!inChargeRole) {
    throw new Error(
      'Scheduler role "In Charge" was not found.',
    )
  }


  if (!memberRole) {
    throw new Error(
      'Scheduler role "Member" was not found.',
    )
  }


  const pairRoles = {
    inChargeRoleId:
      inChargeRole.id,

    memberRoleId:
      memberRole.id,
  }


  // =========================================================
  // STEP 5 — Prepare working schedule
  // =========================================================

  /**
   * Keep historical shifts even when the frontend
   * supplies an unsaved buffer for the visible range.
   */
  const historicalShifts =
    currentShifts.filter(
      shift =>
        shift.date < startDateStr,
    )


  let workingShifts =
    currentShifts


  if (
    clientBufferedShifts !== undefined
    ) {

    const buffered =
      clientBufferedShifts.map(
        (shift, index) => ({
          ...shift,

          /**
           * Unsaved preview shifts may use
           * temporary IDs.
           */
          id:
            shift.id ??
            -(index + 1),
        }),
      )


    workingShifts = [
      ...historicalShifts,
      ...buffered,
    ]
  }


  // =========================================================
  // STEP 6 — Scheduler categories
  // =========================================================

  const schedulerCategories:
    ShiftCategory[] =
      categoriesData.map(
        category => {

          const type:
            ShiftCategory['type'] =
              category.type === 'regular' ||
              category.type === 'special' ||
              category.type === 'vacation' ||
              category.type === 'off'
                ? category.type
                : 'regular'


          const timeOfDay:
            ShiftCategory['timeOfDay'] =
              category.timeOfDay === 'morning' ||
              category.timeOfDay === 'noon' ||
              category.timeOfDay === 'night' ||
              category.timeOfDay === 'none'
                ? category.timeOfDay
                : 'none'


          return {
            ...category,

            type,
            timeOfDay,
          }
        },
      )


  // =========================================================
  // STEP 7 — Locked shifts
  // =========================================================

  /**
   * IMPORTANT:
   *
   * Preserve CURRENT behavior exactly during refactor.
   *
   * Right now schedule.ts treats the full working schedule
   * as locked.
   *
   * We can improve locked/manual semantics separately later.
   */
  const lockedShifts = [
    ...workingShifts,
  ]


  // =========================================================
  // STEP 8 — Holidays
  // =========================================================

  const holidayDates =
    new Set<string>(
      holidayData.map(
        holiday =>
          holiday.date,
      ),
    )


  /**
   * Preserve existing behavior:
   * weekends are also considered holidays.
   */
  const cursor =
    new Date(
      `${startDateStr}T00:00:00`,
    )


  const rangeEnd =
    new Date(
      `${endDateStr}T00:00:00`,
    )


  while (cursor <= rangeEnd) {

    const dayOfWeek =
      cursor.getDay()


    if (
      dayOfWeek === 0 ||
      dayOfWeek === 6
    ) {

      const year =
        cursor.getFullYear()

      const month =
        String(
          cursor.getMonth() + 1,
        ).padStart(2, '0')

      const day =
        String(
          cursor.getDate(),
        ).padStart(2, '0')


      holidayDates.add(
        `${year}-${month}-${day}`,
      )
    }


    cursor.setDate(
      cursor.getDate() + 1,
    )
  }


  // =========================================================
  // STEP 9 — Scheduler employees
  // =========================================================

  const schedulerEmployees =
    emps.map(
      employee => {

        const titleRoleIds =
          employee.titleId
            ? perms
                .filter(
                  permission =>
                    permission.titleId ===
                    employee.titleId,
                )
                .map(
                  permission =>
                    permission.roleId,
                )
            : []


        const overrideRoleIds =
          overrides
            .filter(
              override =>
                override.employeeId ===
                employee.id,
            )
            .map(
              override =>
                override.roleId,
            )


        const roleIds =
          Array.from(
            new Set([
              ...titleRoleIds,
              ...overrideRoleIds,
            ]),
          )


        const employeeAvailability =
          avail
            .filter(
              item =>
                item.employeeId ===
                employee.id,
            )
            .map(
              item => ({
                id:
                  item.id,

                dayOfWeek:
                  item.dayOfWeek,

                categoryId:
                  item.categoryId,

                isMandatory:
                  item.isMandatory ??
                  false,
              }),
            )


        return {
          ...employee,

          roleIds,

          availability:
            employeeAvailability,
        }
      },
    )


  // =========================================================
  // STEP 10 — Scheduler titles
  // =========================================================

  const schedulerTitles =
    titles.map(
      title => {

        const allowedRoleIds =
          perms
            .filter(
              permission =>
                permission.titleId ===
                title.id,
            )
            .map(
              permission =>
                permission.roleId,
            )


        const allowedCategoryIds =
          titleCats
            .filter(
              relation =>
                relation.titleId ===
                title.id,
            )
            .map(
              relation =>
                relation.categoryId,
            )


        const allowedLocationIds =
          titleLocs
            .filter(
              relation =>
                relation.titleId ===
                title.id,
            )
            .map(
              relation =>
                relation.locationId,
            )


        const compatibleTitleIds =
          compatibilityRows
            .filter(
              relation =>
                relation.titleId ===
                title.id,
            )
            .map(
              relation =>
                relation.compatibleTitleId,
            )


        const workingTimePattern:
          'shift' |
          'custom' |
          'official' =
            title.workingTimePattern === 'official' ||
            title.workingTimePattern === 'custom' ||
            title.workingTimePattern === 'shift'
              ? title.workingTimePattern
              : 'shift'


        return {
          ...title,

          workingTimePattern,

          allowedRoleIds,
          allowedCategoryIds,
          allowedLocationIds,
          compatibleTitleIds,
        }
      },
    )


  // =========================================================
  // RESULT
  // =========================================================

  return {
    templates,

    schedulerEmployees,
    schedulerTitles,
    schedulerCategories,

    workingShifts,
    historicalShifts,
    lockedShifts,

    holidayDates,
    pairRoles,

    compatibilityRows,
  }
}