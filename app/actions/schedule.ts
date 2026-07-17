'use server'

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
} from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { generateSchedule, getDatesInRange } from '@/lib/scheduler'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/**
 * Pure sandbox generator: Computes shifts in memory without writing directly to the database.
 */
export async function generateRange(
  startDateStr: string, 
  endDateStr: string,
  clientBufferedShifts?: any[] 
) {
  const userId = await getUserId()

  // 🌟 LOOKBACK FIX: Calculate yesterday's exact date safely
  const startDateObj = new Date(`${startDateStr}T00:00:00`)
  startDateObj.setDate(startDateObj.getDate() - 1)
  const y = startDateObj.getFullYear()
  const m = String(startDateObj.getMonth() + 1).padStart(2, '0')
  const d = String(startDateObj.getDate()).padStart(2, '0')
  const fetchStartStr = `${y}-${m}-${d}`

  // 1. Fetch parameters exactly like before (but start query from yesterday)
  const [templates, emps, perms, overrides, avail, holidayData, categoriesData, currentShifts, titleLocs, titleCats, titles] = await Promise.all([
    db.select().from(shiftTemplates).where(eq(shiftTemplates.userId, userId)),
    db.select().from(employees).where(eq(employees.userId, userId)),
    db.select().from(titlePermissions).where(eq(titlePermissions.userId, userId)),
    db.select().from(employeeRoleOverrides).where(eq(employeeRoleOverrides.userId, userId)),
    db.select().from(availability).where(eq(availability.userId, userId)),
    db.select().from(holidays).where(
      and(gte(holidays.date, startDateStr), lte(holidays.date, endDateStr))
    ),
    db.select().from(shiftCategories).where(eq(shiftCategories.userId, userId)),
    db.select().from(shifts).where(
      and(
        eq(shifts.userId, userId),
        gte(shifts.date, fetchStartStr), // 👈 Pulls in yesterday's constraints!
        lte(shifts.date, endDateStr)
      )
    ),
    db.select().from(titleAllowedLocations).where(eq(titleAllowedLocations.userId, userId)),
    db.select().from(titleAllowedCategories).where(eq(titleAllowedCategories.userId, userId)),
    db.select().from(employeeTitles).where(eq(employeeTitles.userId, userId))
  ])

  if (templates.length === 0) {
    throw new Error('Add at least one shift rule before generating a schedule.')
  }

  // Combine client buffer with the database's historical yesterday shifts
  let workingShifts = currentShifts
  if (clientBufferedShifts && clientBufferedShifts.length > 0) {
    const yesterdayShifts = currentShifts.filter(s => s.date === fetchStartStr)
    workingShifts = [...yesterdayShifts, ...clientBufferedShifts]
  }

  // 2. Extract protected overrides from the active working layout
  const protectedOverrides = workingShifts.filter(shift => {
    const cat = categoriesData.find(c => Number(c.id) === Number(shift.categoryId))
    
    const isVac = cat?.type === 'vacation' || cat?.name === 'ลาหยุด'
    const isSpecial = cat?.type === 'special'
    const isOff = cat?.type === 'off' || cat?.name === 'OFF (Lock)'
    const isManualFloating = !shift.roleId 

    return isVac || isSpecial || isOff || isManualFloating
  }).map(shift => ({
    locationId: shift.locationId,
    roleId: shift.roleId,
    employeeId: shift.employeeId,
    date: shift.date,
    categoryId: shift.categoryId,
  }))

  const holidayDates = holidayData.map(h => h.date)
  const datesToSchedule = getDatesInRange(startDateStr, endDateStr)

  const roster = emps.map((emp) => {
    const titleRoles = emp.titleId 
      ? perms.filter(p => p.titleId === emp.titleId).map(p => p.roleId)
      : []
    const overrideRoles = overrides.filter(o => o.employeeId === emp.id).map(o => o.roleId)
    const effectiveRoleIds = Array.from(new Set([...titleRoles, ...overrideRoles]))

    const allowedLocationIds = titleLocs
      .filter(tl => tl.titleId === emp.titleId)
      .map(tl => tl.locationId)

    const allowedCategoryIds = titleCats
      .filter(tc => tc.titleId === emp.titleId)
      .map(tc => tc.categoryId)

    const myTitle = titles.find((t) => t.id === emp.titleId)

    let allowedDays = [0, 1, 2, 3, 4, 5, 6] 
    if (myTitle) {
      if (myTitle.workingTimePattern === 'official') {
        allowedDays = [1, 2, 3, 4, 5] 
      } else if (myTitle.workingTimePattern === 'custom' && myTitle.customDays) {
        allowedDays = myTitle.customDays
          .split(',')
          .filter(Boolean)
          .map(Number)
      }
    }

    return {
      id: emp.id,
      maxHoursPerWeek: emp.maxHoursPerWeek,
      roleIds: effectiveRoleIds,
      allowedLocationIds: emp.titleId ? allowedLocationIds : [],
      allowedCategoryIds: allowedCategoryIds, 

      mustWorkAllAvailable: myTitle ? myTitle.mustWorkAllAvailable : false,
      canRestOnHolidays: myTitle 
        ? ((myTitle as any).restOnHoliday ?? (myTitle as any).rest_on_holiday ?? false) 
        : false,

      allowedDays: allowedDays,

      availability: avail
        .filter((a) => a.employeeId === emp.id)
        .map((a) => ({
          dayOfWeek: a.dayOfWeek,
          categoryId: a.categoryId,
          isMandatory: a.isMandatory ?? false,
        })),
    }
  })

  // 3. Pure in-memory calculation
  const generated = generateSchedule(templates, roster, datesToSchedule, holidayDates, categoriesData, protectedOverrides)

  // 🌟 Strip out yesterday's context shifts before returning the final array to the frontend UI
  const finalGenerated = generated.filter(g => datesToSchedule.includes(g.date))
  const openCount = finalGenerated.filter((g) => g.employeeId === null).length
  
  return { 
    shifts: finalGenerated, 
    total: finalGenerated.length, 
    open: openCount 
  }
}

/**
 * High-performance bulk commit: Clears out target ranges and saves the approved client buffer.
 */
export async function commitBufferedShifts(startDateStr: string, endDateStr: string, shiftsList: any[]) {
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

  if (shiftsList.length > 0) {
    await db.insert(shifts).values(
      shiftsList.map((s) => ({
        userId,
        locationId: s.locationId,
        roleId: s.roleId,
        employeeId: s.employeeId,
        date: s.date,
        categoryId: s.categoryId,
      }))
    )
  }

  revalidatePath('/')
  return { success: true }
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