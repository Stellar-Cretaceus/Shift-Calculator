import rawData from './data_test.json'

import type { EmployeeTitle } from '@/lib/types'

/**
 * Shape of one row from your exported JSON file.
 *
 * The database export stores list-like values as strings:
 *
 *   "2, 4, 6"
 *
 * We convert those into:
 *
 *   [2, 4, 6]
 */
type RawEmployeeRow = {
  id: number
  employee_type: string
  titleId: number

  working_time_pattern: 'official' | 'shift' | 'custom'
  custom_days: string

  rest_on_holiday: boolean
  must_work_all_available: boolean

  compatible_title_ids: string
  allowed_category_ids: string
  permission_role_ids: string
}

/**
 * Convert comma-separated strings into number arrays.
 *
 * Examples:
 *
 * "2, 4, 6" -> [2, 4, 6]
 * "6"       -> [6]
 * ""        -> []
 */
function parseNumberList(value: string): number[] {
  if (!value || !value.trim()) {
    return []
  }

  return value
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => !Number.isNaN(item))
}

/**
 * Normalized employee data used by scheduler tests.
 *
 * This is intentionally simpler than your real Employee type.
 * We only keep the fields useful for the rule tests we're doing now.
 */
export const testEmployees = (rawData as RawEmployeeRow[]).map(row => ({
  id: row.id,
  titleId: row.titleId,

  workingTimePattern: row.working_time_pattern,
  customDays: parseNumberList(row.custom_days),

  restOnHoliday: row.rest_on_holiday,
  mustWorkAllAvailable: row.must_work_all_available,

  compatibleTitleIds: parseNumberList(row.compatible_title_ids),
  allowedCategoryIds: parseNumberList(row.allowed_category_ids),

  /**
   * These are the roles this employee/title is allowed to perform.
   *
   * Example:
   *
   * "5, 6" -> [5, 6]
   */
  roleIds: parseNumberList(row.permission_role_ids),
}))

/**
 * Build a unique list of Titles/Ranks from the employee snapshot.
 *
 * Many employees can share the same title, which is completely normal.
 * Since title rules are repeated on each joined employee row,
 * we collapse duplicates here using titleId.
 */
export const testTitles: EmployeeTitle[] = Array.from(
  new Map(
    testEmployees.map(employee => [
      employee.titleId,

      {
        id: employee.titleId,

        /**
         * Your current export does not include titleName.
         * That's okay for rule testing because the scheduler uses IDs.
         */
        name: `Title ${employee.titleId}`,

        workingTimePattern: employee.workingTimePattern,

        /**
         * Your real EmployeeTitle type currently stores customDays
         * as a comma-separated string.
         *
         * The test loader temporarily parsed it into number[],
         * so here we convert it back to the format expected by the type.
         */
        customDays: employee.customDays.join(','),

        restOnHoliday: employee.restOnHoliday,
        mustWorkAllAvailable: employee.mustWorkAllAvailable,

        allowedRoleIds: employee.roleIds,

        compatibleTitleIds: employee.compatibleTitleIds,

        allowedCategoryIds: employee.allowedCategoryIds,

        /**
         * Location restrictions are architected,
         * but currently inactive in the scheduler.
         */
        allowedLocationIds: [],
      } satisfies EmployeeTitle,
    ]),
  ).values(),
)
