'use server'

import { db } from '@/lib/db'
import {
  locations,
  roles,
  employees,
  employeeRoles,
  availability,
  shiftTemplates,
} from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { and, asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/* ------------------------------- Locations ------------------------------- */

export async function getLocations() {
  const userId = await getUserId()
  return db
    .select()
    .from(locations)
    .where(eq(locations.userId, userId))
    .orderBy(asc(locations.name))
}

export async function createLocation(name: string) {
  const userId = await getUserId()
  if (!name.trim()) throw new Error('Location name is required')
  await db.insert(locations).values({ userId, name: name.trim() })
  revalidatePath('/')
}

export async function deleteLocation(id: number) {
  const userId = await getUserId()
  await db
    .delete(locations)
    .where(and(eq(locations.id, id), eq(locations.userId, userId)))
  revalidatePath('/')
}

/* --------------------------------- Roles --------------------------------- */

export async function getRoles() {
  const userId = await getUserId()
  return db
    .select()
    .from(roles)
    .where(eq(roles.userId, userId))
    .orderBy(asc(roles.name))
}

export async function createRole(name: string, color: string) {
  const userId = await getUserId()
  if (!name.trim()) throw new Error('Role name is required')
  await db.insert(roles).values({ userId, name: name.trim(), color })
  revalidatePath('/')
}

export async function deleteRole(id: number) {
  const userId = await getUserId()
  await db.delete(roles).where(and(eq(roles.id, id), eq(roles.userId, userId)))
  revalidatePath('/')
}

/* ------------------------------- Employees ------------------------------- */

export async function getEmployees() {
  const userId = await getUserId()
  const [emps, empRoles, avail] = await Promise.all([
    db
      .select()
      .from(employees)
      .where(eq(employees.userId, userId))
      .orderBy(asc(employees.name)),
    db.select().from(employeeRoles).where(eq(employeeRoles.userId, userId)),
    db.select().from(availability).where(eq(availability.userId, userId)),
  ])

  return emps.map((emp) => ({
    ...emp,
    roleIds: empRoles.filter((r) => r.employeeId === emp.id).map((r) => r.roleId),
    availability: avail.filter((a) => a.employeeId === emp.id),
  }))
}

export async function createEmployee(input: {
  name: string
  email?: string
  maxHoursPerWeek: number
  roleIds: number[]
}) {
  const userId = await getUserId()
  if (!input.name.trim()) throw new Error('Employee name is required')

  const [emp] = await db
    .insert(employees)
    .values({
      userId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      maxHoursPerWeek: input.maxHoursPerWeek,
    })
    .returning()

  if (input.roleIds.length > 0) {
    await db.insert(employeeRoles).values(
      input.roleIds.map((roleId) => ({
        userId,
        employeeId: emp.id,
        roleId,
      })),
    )
  }
  revalidatePath('/')
}

export async function updateEmployeeRoles(employeeId: number, roleIds: number[]) {
  const userId = await getUserId()
  await db
    .delete(employeeRoles)
    .where(
      and(
        eq(employeeRoles.employeeId, employeeId),
        eq(employeeRoles.userId, userId),
      ),
    )
  if (roleIds.length > 0) {
    await db
      .insert(employeeRoles)
      .values(roleIds.map((roleId) => ({ userId, employeeId, roleId })))
  }
  revalidatePath('/')
}

export async function deleteEmployee(id: number) {
  const userId = await getUserId()
  await db
    .delete(employees)
    .where(and(eq(employees.id, id), eq(employees.userId, userId)))
  await db
    .delete(employeeRoles)
    .where(and(eq(employeeRoles.employeeId, id), eq(employeeRoles.userId, userId)))
  await db
    .delete(availability)
    .where(and(eq(availability.employeeId, id), eq(availability.userId, userId)))
  revalidatePath('/')
}

/* ------------------------------ Availability ----------------------------- */

export async function addAvailability(input: {
  employeeId: number
  dayOfWeek: number
  startTime: string
  endTime: string
}) {
  const userId = await getUserId()
  await db.insert(availability).values({ userId, ...input })
  revalidatePath('/')
}

export async function deleteAvailability(id: number) {
  const userId = await getUserId()
  await db
    .delete(availability)
    .where(and(eq(availability.id, id), eq(availability.userId, userId)))
  revalidatePath('/')
}

/* --------------------------- Shift templates (rules) --------------------- */

export async function getShiftTemplates() {
  const userId = await getUserId()
  return db
    .select()
    .from(shiftTemplates)
    .where(eq(shiftTemplates.userId, userId))
    .orderBy(asc(shiftTemplates.dayOfWeek), asc(shiftTemplates.startTime))
}

export async function createShiftTemplate(input: {
  locationId: number
  roleId: number
  dayOfWeek: number
  startTime: string
  endTime: string
  requiredCount: number
}) {
  const userId = await getUserId()
  await db.insert(shiftTemplates).values({ userId, ...input })
  revalidatePath('/')
}

export async function deleteShiftTemplate(id: number) {
  const userId = await getUserId()
  await db
    .delete(shiftTemplates)
    .where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.userId, userId)))
  revalidatePath('/')
}
