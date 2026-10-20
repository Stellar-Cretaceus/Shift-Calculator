import type {
  Employee,
  EmployeeTitle,
} from '@/lib/types'

/**
 * Check whether this employee can perform a particular shift role.
 *
 * employee.roleIds is already the "effective" list created by the
 * server code, meaning it currently contains:
 *
 *   Title roles + Employee overrides
 *
 * So the scheduler doesn't need to calculate that again.
 */
export function canEmployeeWorkRole(
  employee: Pick<Employee, 'roleIds'>,
  roleId: number,
): boolean {
  return employee.roleIds.includes(roleId)
}

/**
 * Check whether a Title/Rank is allowed to work this shift category.
 *
 * For automatic scheduling we expect these to normally be:
 * Morning / Noon / Night.
 *
 * Special and Vacation should not normally reach automatic generation.
 */
export function canTitleWorkCategory(
  title: EmployeeTitle | undefined,
  categoryId: number,
): boolean {
  // An employee without a valid title shouldn't be automatically scheduled.
  if (!title) {
    return false
  }

  return title.allowedCategoryIds.includes(categoryId)
}

/**
 * Location permission is intentionally NOT active yet.
 *
 * We keep this helper so that if you decide to enable the feature later,
 * the scheduler architecture does not need to change.
 */
export function canTitleWorkLocation(
  title: EmployeeTitle | undefined,
  locationId: number,
): boolean {
  if (!title) {
    return false
  }

  // Currently your application treats location restriction as unused.
  // Therefore every valid title is accepted for every location.
  //
  // Later this can simply become:
  //
  // return title.allowedLocationIds.includes(locationId)

  return true
}