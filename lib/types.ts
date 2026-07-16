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
  dayOfWeek: number
  categoryId: number 
  isMandatory: boolean
}

export type EmployeeTitle = {
  id: number
  name: string
  workingTimePattern: 'official' | 'shift' | 'custom'
  customDays: string
  restOnHoliday: boolean
  mustWorkAllAvailable: boolean
  allowedRoleIds: number[]
  compatibleTitleIds: number[] // Updated to track allowed coworker titles!
  allowedCategoryIds: number[]
  allowedLocationIds: number[]
}

// Update the existing Employee type to include titleId
export type Employee = {
  id: number
  name: string
  email: string | null
  maxHoursPerWeek: number
  titleId: number | null     // <-- Added this!
  roleIds: number[]          // These are now their *effective* combined roles
  availability: AvailabilitySlot[]
}

export type ShiftTemplate = {
  id: number
  locationId: number
  roleId: number
  dayOfWeek: number
  categoryId: number
  requiredCount: number
}

export type Shift = {
  id: number
  locationId: number
  roleId: number | null 
  employeeId: number | null
  date: string
  categoryId: number
}

export type ShiftCategoryType = 'regular' | 'special' | 'vacation' | 'off';

export type ShiftCategory = {
  id: number;
  userId: string;
  name: string;
  startTime: string;
  endTime: string;
  type: 'regular' | 'special' | 'vacation' | 'off';
  abbreviation: string;
  timeOfDay: 'morning' | 'noon' | 'night' | 'none';
  color: string; // <-- ADD THIS LINE HERE
  createdAt: Date;
};



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
