import { pgTable, text, timestamp, boolean, serial, integer } from 'drizzle-orm/pg-core'

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// --- App tables ------------------------------------------------------------
// Every table carries a plain `userId` column for per-user scoping (no RLS on
// Neon). No foreign keys by default so the schema is easy to iterate on.

// Physical sites / departments where shifts happen.
export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Positions that need to be filled, e.g. Cashier, Cook, Manager.
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  // Tailwind-friendly hex color used to tint shift blocks on the calendar.
  color: text('color').notNull().default('#2563eb'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Staff members who get assigned to shifts.
export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  // Scheduling constraints used by the auto-generator.
  maxHoursPerWeek: integer('maxHoursPerWeek').notNull().default(40),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Which roles an employee is qualified to work (many-to-many).
export const employeeRoles = pgTable('employee_roles', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  employeeId: integer('employeeId').notNull(),
  roleId: integer('roleId').notNull(),
})

// When an employee is available to work. dayOfWeek: 0 = Sunday ... 6 = Saturday.
// Times stored as "HH:MM" 24h strings.
export const availability = pgTable('availability', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  employeeId: integer('employeeId').notNull(),
  dayOfWeek: integer('dayOfWeek').notNull(),
  startTime: text('startTime').notNull(),
  endTime: text('endTime').notNull(),
})

// The RULES: recurring shift needs. "On <dayOfWeek> at <location> we need
// <requiredCount> people in <role> from <startTime> to <endTime>."
export const shiftTemplates = pgTable('shift_templates', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  locationId: integer('locationId').notNull(),
  roleId: integer('roleId').notNull(),
  dayOfWeek: integer('dayOfWeek').notNull(),
  startTime: text('startTime').notNull(),
  endTime: text('endTime').notNull(),
  requiredCount: integer('requiredCount').notNull().default(1),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// The generated schedule: concrete shifts assigned to employees on real dates.
// date stored as "YYYY-MM-DD". employeeId null means an unfilled/open slot.
export const shifts = pgTable('shifts', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  locationId: integer('locationId').notNull(),
  roleId: integer('roleId').notNull(),
  employeeId: integer('employeeId'),
  date: text('date').notNull(),
  startTime: text('startTime').notNull(),
  endTime: text('endTime').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})
