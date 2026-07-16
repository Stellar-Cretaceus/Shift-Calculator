'use server'

import { db } from '@/lib/db'
import {
  locations,
  roles,
  employees,
  employeeTitles,
  titlePermissions,
  employeeRoleOverrides,
  availability,
  shiftTemplates,
  shiftCategories,
  titleCompatibleTitles,
  titleAllowedCategories,
  titleAllowedLocations,
  holidays,
} from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { and, asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

/* ------------------------------- Locations ------------------------------- */

export async function getLocations() {
  const userId = await getUserId()
  return db.select().from(locations).where(eq(locations.userId, userId)).orderBy(asc(locations.name))
}

export async function createLocation(name: string) {
  const userId = await getUserId()
  if (!name.trim()) throw new Error('Location name is required')
  await db.insert(locations).values({ userId, name: name.trim() })
  revalidatePath('/')
}

export async function deleteLocation(id: number) {
  const userId = await getUserId()
  await db.delete(locations).where(and(eq(locations.id, id), eq(locations.userId, userId)))
  revalidatePath('/')
}

/* --------------------------------- Roles (Shift Roles) ------------------- */

export async function getRoles() {
  const userId = await getUserId()
  return db.select().from(roles).where(eq(roles.userId, userId)).orderBy(asc(roles.name))
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

/* ------------------------- Employee Titles (Ranks) ----------------------- */

export async function getEmployeeTitles() {
  const userId = await getUserId()
  const [titles, perms, compats, titleCats, titleLocs] = await Promise.all([
    db.select().from(employeeTitles).where(eq(employeeTitles.userId, userId)).orderBy(asc(employeeTitles.name)),
    db.select().from(titlePermissions).where(eq(titlePermissions.userId, userId)),
    db.select().from(titleCompatibleTitles).where(eq(titleCompatibleTitles.userId, userId)),
    db.select().from(titleAllowedCategories).where(eq(titleAllowedCategories.userId, userId)),
    db.select().from(titleAllowedLocations).where(eq(titleAllowedLocations.userId, userId)) // <-- Fetch table entries
  ])

  return titles.map(title => ({
    ...title,
    allowedRoleIds: perms.filter(p => p.titleId === title.id).map(p => p.roleId),
    compatibleTitleIds: compats.filter(c => c.titleId === title.id).map(c => c.compatibleTitleId),
    allowedCategoryIds: titleCats.filter(tc => tc.titleId === title.id).map(tc => tc.categoryId),
    allowedLocationIds: titleLocs.filter(tl => tl.titleId === title.id).map(tl => tl.locationId) // <-- Map forward to client
  }))
}

export async function createEmployeeTitle(input: {
  name: string
  workingTimePattern: 'official' | 'shift' | 'custom'
  customDays: string
  restOnHoliday: boolean
  mustWorkAllAvailable: boolean
  allowedRoleIds: number[]
  compatibleTitleIds: number[]
  allowedCategoryIds: number[]
  allowedLocationIds: number[] // Safe optional checking context mapping
}) {
  const userId = await getUserId()
  if (!input.name.trim()) throw new Error('Title name is required')

  // DEFENSIVE FIX: Fallback to an empty array if fields arrive undefined from old forms
  const allowedRoleIds = input.allowedRoleIds || []
  const compatibleTitleIds = input.compatibleTitleIds || []
  const allowedCategoryIds = input.allowedCategoryIds || []
  const allowedLocationIds = input.allowedLocationIds || []

  const [title] = await db.insert(employeeTitles).values({
    userId,
    name: input.name.trim(),
    workingTimePattern: input.workingTimePattern,
    customDays: input.customDays,
    restOnHoliday: input.restOnHoliday,
    mustWorkAllAvailable: input.mustWorkAllAvailable,
  }).returning()
  
  // Safely check the fallbacked arrays instead of the raw input
  if (allowedRoleIds.length > 0) {
    await db.insert(titlePermissions).values(
      allowedRoleIds.map(roleId => ({ userId, titleId: title.id, roleId }))
    )
  }

  if (compatibleTitleIds.length > 0) {
    await db.insert(titleCompatibleTitles).values(
      compatibleTitleIds.map(compatibleTitleId => ({ userId, titleId: title.id, compatibleTitleId }))
    )
  }

  if (allowedCategoryIds.length > 0) {
    await db.insert(titleAllowedCategories).values(
      allowedCategoryIds.map(categoryId => ({ userId, titleId: title.id, categoryId }))
    )
  }

  if (allowedLocationIds.length > 0) {
    await db.insert(titleAllowedLocations).values(
      allowedLocationIds.map(locationId => ({ userId, titleId: title.id, locationId }))
    )
  }
  
  revalidatePath('/')
}

export async function deleteEmployeeTitle(id: number) {
  const userId = await getUserId()
  await db.delete(employeeTitles).where(and(eq(employeeTitles.id, id), eq(employeeTitles.userId, userId)))
  revalidatePath('/')
}

/* ------------------------------- Employees ------------------------------- */

export async function getEmployees() {
  const userId = await getUserId()
  const [emps, perms, overrides, avail] = await Promise.all([
    db.select().from(employees).where(eq(employees.userId, userId)).orderBy(asc(employees.name)),
    db.select().from(titlePermissions).where(eq(titlePermissions.userId, userId)),
    db.select().from(employeeRoleOverrides).where(eq(employeeRoleOverrides.userId, userId)),
    db.select().from(availability).where(eq(availability.userId, userId)),
  ])

  return emps.map((emp) => {
    // 1. Get the roles allowed by their Master Title (Rank)
    const titleRoles = emp.titleId 
      ? perms.filter(p => p.titleId === emp.titleId).map(p => p.roleId)
      : []
    
    // 2. Get any special overrides for this specific person
    const overrideRoles = overrides.filter(o => o.employeeId === emp.id).map(o => o.roleId)
    
    // 3. Combine them and remove duplicates so the Scheduler works flawlessly
    const effectiveRoleIds = Array.from(new Set([...titleRoles, ...overrideRoles]))

    return {
      ...emp,
      roleIds: effectiveRoleIds, // The scheduler uses this!
      availability: avail.filter((a) => a.employeeId === emp.id),
    }
  })
}

export async function createEmployee(input: {
  name: string
  email?: string
  maxHoursPerWeek: number
  titleId: number | null // Replaced roleIds array with the single Title ID
}) {
  const userId = await getUserId()
  if (!input.name.trim()) throw new Error('Employee name is required')

  await db.insert(employees).values({
      userId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      maxHoursPerWeek: input.maxHoursPerWeek,
      titleId: input.titleId // Set their rank right here!
  })
  
  revalidatePath('/')
}

export async function deleteEmployee(id: number) {
  const userId = await getUserId()
  await db.delete(employees).where(and(eq(employees.id, id), eq(employees.userId, userId)))
  // Cascades will handle overrides and availability automatically!
  revalidatePath('/')
}

export async function updateEmployeeTitle(employeeId: number, titleId: number | null) {
  const userId = await getUserId()
  await db.update(employees)
    .set({ titleId })
    .where(and(eq(employees.id, employeeId), eq(employees.userId, userId)))
  revalidatePath('/')
}

// Added this to handle those special exception cases!
export async function toggleEmployeeOverride(employeeId: number, roleId: number) {
  const userId = await getUserId()
  
  // Check if override exists
  const existing = await db.select().from(employeeRoleOverrides).where(
    and(
      eq(employeeRoleOverrides.employeeId, employeeId),
      eq(employeeRoleOverrides.roleId, roleId),
      eq(employeeRoleOverrides.userId, userId)
    )
  )

  if (existing.length > 0) {
    // Remove exception
    await db.delete(employeeRoleOverrides).where(eq(employeeRoleOverrides.id, existing[0].id))
  } else {
    // Add exception
    await db.insert(employeeRoleOverrides).values({ userId, employeeId, roleId })
  }
  revalidatePath('/')
}


/* ------------------------------ Availability ----------------------------- */

export async function addAvailability(input: {
  employeeId: number
  dayOfWeek: number
  categoryId: number 
  isMandatory: boolean 
}) {
  const userId = await getUserId()
  await db.insert(availability).values({ userId, ...input })
  revalidatePath('/')
}

export async function deleteAvailability(id: number) {
  const userId = await getUserId()
  await db.delete(availability).where(and(eq(availability.id, id), eq(availability.userId, userId)))
  revalidatePath('/')
}

/* --------------------------- Shift templates (rules) --------------------- */

export async function getShiftTemplates() {
  const userId = await getUserId()
  return db.select().from(shiftTemplates).where(eq(shiftTemplates.userId, userId)).orderBy(asc(shiftTemplates.dayOfWeek))
}

export async function createShiftTemplate(input: {
  locationId: number
  roleId: number
  dayOfWeek: number
  categoryId: number
  requiredCount: number
}) {
  const userId = await getUserId()
  await db.insert(shiftTemplates).values({ userId, ...input })
  revalidatePath('/')
}

export async function deleteShiftTemplate(id: number) {
  const userId = await getUserId()
  await db.delete(shiftTemplates).where(and(eq(shiftTemplates.id, id), eq(shiftTemplates.userId, userId)))
  revalidatePath('/')
}

/* --------------------------- Shift Categories --------------------- */

export async function getCategories() {
  const userId = await getUserId()
  return db.select().from(shiftCategories).where(eq(shiftCategories.userId, userId))
}

export async function createCategory(data: { 
  name: string; 
  startTime: string; 
  endTime: string;
  type: 'regular' | 'special' | 'vacation';
  abbreviation: string;
  timeOfDay: 'morning' | 'noon' | 'night' | 'none';
  color: string; // <-- Add this value parameter
}) {
  const userId = await getUserId()
  
  const isVacation = data.type === 'vacation'
  const startTime = isVacation ? '00:00' : data.startTime
  const endTime = isVacation ? '00:00' : data.endTime

  await db.insert(shiftCategories).values({
    userId,
    name: data.name,
    startTime,
    endTime,
    type: data.type, 
    abbreviation: data.abbreviation,
    timeOfDay: data.timeOfDay || 'none',
    color: data.color || '#2563eb', // <-- Save it to the database table row
  })
  revalidatePath('/')
}

export async function deleteCategory(id: number) {
  const userId = await getUserId()
  await db.delete(shiftCategories).where(and(eq(shiftCategories.id, id), eq(shiftCategories.userId, userId)))
  revalidatePath('/')
}

/* --------------------------------- Holidays ------------------------------ */
export async function getHolidays() {
  return db.select().from(holidays)
}