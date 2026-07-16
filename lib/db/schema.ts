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
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Positions that need to be filled, e.g. Cashier, Cook, Manager.
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Tailwind-friendly hex color used to tint shift blocks on the calendar.
  color: text('color').notNull().default('#2563eb'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Staff members who get assigned to shifts.
export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  // Scheduling constraints used by the auto-generator.
  maxHoursPerWeek: integer('maxHoursPerWeek').notNull().default(40),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  employeeType: text('employee_type').default('Type2'),
  titleId: integer('titleId') 
    // We don't cascade delete here, we just set null if the title is deleted
    // so we don't accidentally delete the employee!
    .references(() => employeeTitles.id, { onDelete: 'set null' }),
})


// 1. The Ranks/Titles (e.g., S1, S2, S3)
export const employeeTitles = pgTable('employee_titles', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g. S1, S2, S3
  workingTimePattern: text('working_time_pattern').notNull().default('shift'), // 'official' | 'shift' | 'custom'
  customDays: text('custom_days').notNull().default(''), // e.g., "1,2,3,4,5"
  restOnHoliday: boolean('rest_on_holiday').notNull().default(false),
  mustWorkAllAvailable: boolean('must_work_all_available').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});

// 2. The Master Mapping: "Which Rank can do which Shift Role?"
// Replaces the old employeeRoles table
export const titlePermissions = pgTable('title_permissions', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  titleId: integer('titleId')
    .notNull()
    .references(() => employeeTitles.id, { onDelete: 'cascade' }),
  roleId: integer('roleId')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
});

// Upgraded Table: Maps Title-to-Title compatibility (e.g., S1 can work with S3)
export const titleCompatibleTitles = pgTable('title_compatible_titles', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  titleId: integer('titleId')
    .notNull()
    .references(() => employeeTitles.id, { onDelete: 'cascade' }),
  compatibleTitleId: integer('compatibleTitleId')
    .notNull()
    .references(() => employeeTitles.id, { onDelete: 'cascade' }), // Self-referencing Title field!
});

// New Table: Maps Employee Titles to Allowed Shift Categories (Many-to-Many)
export const titleAllowedCategories = pgTable('title_allowed_categories', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  titleId: integer('titleId')
    .notNull()
    .references(() => employeeTitles.id, { onDelete: 'cascade' }),
  categoryId: integer('categoryId')
    .notNull()
    .references(() => shiftCategories.id, { onDelete: 'cascade' }),
});

// New Table: Maps Employee Titles to Allowed Physical Locations (Many-to-Many)
export const titleAllowedLocations = pgTable('title_allowed_locations', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  titleId: integer('titleId')
    .notNull()
    .references(() => employeeTitles.id, { onDelete: 'cascade' }),
  locationId: integer('locationId')
    .notNull()
    .references(() => locations.id, { onDelete: 'cascade' }),
});


// 3. The Exceptions: "This specific person has special permission"
export const employeeRoleOverrides = pgTable('employee_role_overrides', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  employeeId: integer('employeeId')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  roleId: integer('roleId')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
});

// When an employee is available to work. dayOfWeek: 0 = Sunday ... 6 = Saturday.
// Times stored as "HH:MM" 24h strings.
export const availability = pgTable('availability', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  employeeId: integer('employeeId').notNull(),
  dayOfWeek: integer('dayOfWeek').notNull(),
  categoryId: integer('categoryId')
    .notNull()
    .references(() => shiftCategories.id, { onDelete: 'cascade' }),
    isMandatory: boolean('isMandatory').notNull().default(false),
})

// The RULES: recurring shift needs. "On <dayOfWeek> at <location> we need
// <requiredCount> people in <role> from <startTime> to <endTime>."
export const shiftTemplates = pgTable('shift_templates', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  locationId: integer('locationId').notNull(),
  roleId: integer('roleId').notNull(),
  dayOfWeek: integer('dayOfWeek').notNull(),
  categoryId: integer('categoryId')
    .notNull()
    .references(() => shiftCategories.id, { onDelete: 'cascade' }),
  requiredCount: integer('requiredCount').notNull().default(1),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// The generated schedule: concrete shifts assigned to employees on real dates.
// date stored as "YYYY-MM-DD". employeeId null means an unfilled/open slot.
export const shifts = pgTable('shifts', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  locationId: integer('locationId').notNull(),
  roleId: integer('roleId'),
  employeeId: integer('employeeId'),
  date: text('date').notNull(),
  categoryId: integer('categoryId')
    .notNull()
    .references(() => shiftCategories.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const shiftCategories = pgTable('shift_categories', {
  id: serial('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), 
  startTime: text('startTime').notNull(), 
  endTime: text('endTime').notNull(), 
  type: text('type').notNull().default('regular'), 
  abbreviation: text('abbreviation').notNull().default(''), 
  timeOfDay: text('timeOfDay').notNull().default('none'),
  
  // NEW: Store the Tailwind-friendly hex code directly on the category block
  color: text('color').notNull().default('#2563eb'), 
  
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  // We use the date string exactly as the iApp API returns it (e.g., "2025-06-08")
  date: text('date').notNull().unique(), 
  name: text('name').notNull(), // e.g., "วันสงกรานต์"
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});



