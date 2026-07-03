'use server'

import { db } from '@/lib/db'
import {
  employees,
  employeeRoles,
  availability,
  shiftTemplates,
  shifts,
} from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { generateSchedule, formatDate } from '@/lib/scheduler'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/** Returns the Sunday on or before the given date (start of the week). */
function weekStartFromString(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Generate a week of shifts from the saved templates + roster and persist them.
 * Existing shifts in that week are replaced so re-running is idempotent.
 */
export async function generateWeek(weekStartStr: string) {
  const userId = await getUserId()
  const weekStart = weekStartFromString(weekStartStr)

  const [templates, emps, empRoles, avail] = await Promise.all([
    db.select().from(shiftTemplates).where(eq(shiftTemplates.userId, userId)),
    db.select().from(employees).where(eq(employees.userId, userId)),
    db.select().from(employeeRoles).where(eq(employeeRoles.userId, userId)),
    db.select().from(availability).where(eq(availability.userId, userId)),
  ])

  if (templates.length === 0) {
    throw new Error('Add at least one shift rule before generating a schedule.')
  }

  const roster = emps.map((emp) => ({
    id: emp.id,
    maxHoursPerWeek: emp.maxHoursPerWeek,
    roleIds: empRoles.filter((r) => r.employeeId === emp.id).map((r) => r.roleId),
    availability: avail
      .filter((a) => a.employeeId === emp.id)
      .map((a) => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
  }))

  const generated = generateSchedule(templates, roster, weekStart)

  // Replace the target week's shifts.
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const startStr = formatDate(weekStart)
  const endStr = formatDate(weekEnd)

  await db
    .delete(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        gte(shifts.date, startStr),
        lte(shifts.date, endStr),
      ),
    )

  if (generated.length > 0) {
    await db.insert(shifts).values(generated.map((g) => ({ userId, ...g })))
  }

  revalidatePath('/')
  const open = generated.filter((g) => g.employeeId === null).length
  return { total: generated.length, open }
}

/** All shifts within the week containing weekStartStr. */
export async function getShiftsForWeek(weekStartStr: string) {
  const userId = await getUserId()
  const weekStart = weekStartFromString(weekStartStr)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  return db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        gte(shifts.date, formatDate(weekStart)),
        lte(shifts.date, formatDate(weekEnd)),
      ),
    )
    .orderBy(asc(shifts.date), asc(shifts.startTime))
}

export async function assignShift(shiftId: number, employeeId: number | null) {
  const userId = await getUserId()
  await db
    .update(shifts)
    .set({ employeeId })
    .where(and(eq(shifts.id, shiftId), eq(shifts.userId, userId)))
  revalidatePath('/')
}

export async function clearWeek(weekStartStr: string) {
  const userId = await getUserId()
  const weekStart = weekStartFromString(weekStartStr)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  await db
    .delete(shifts)
    .where(
      and(
        eq(shifts.userId, userId),
        gte(shifts.date, formatDate(weekStart)),
        lte(shifts.date, formatDate(weekEnd)),
      ),
    )
  revalidatePath('/')
}
