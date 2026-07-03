export type Location = {
  id: number
  name: string
}

export type Role = {
  id: number
  name: string
  color: string
}

export type AvailabilitySlot = {
  id: number
  employeeId: number
  dayOfWeek: number
  startTime: string
  endTime: string
}

export type Employee = {
  id: number
  name: string
  email: string | null
  maxHoursPerWeek: number
  roleIds: number[]
  availability: AvailabilitySlot[]
}

export type ShiftTemplate = {
  id: number
  locationId: number
  roleId: number
  dayOfWeek: number
  startTime: string
  endTime: string
  requiredCount: number
}

export type Shift = {
  id: number
  locationId: number
  roleId: number
  employeeId: number | null
  date: string
  startTime: string
  endTime: string
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Palette offered when creating a role. */
export const ROLE_COLORS = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#db2777', // pink
  '#4b5563', // gray
] as const
