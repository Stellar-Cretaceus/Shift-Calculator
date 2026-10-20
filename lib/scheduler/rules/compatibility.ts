import type { EmployeeTitle } from '@/lib/types'

/**
 * Find a Title/Rank by its ID.
 *
 * We keep this tiny helper here for now.
 * Later ScheduleContext will probably use a Map, making lookup faster.
 */
export function findTitle(
  titles: EmployeeTitle[],
  titleId: number | null,
): EmployeeTitle | undefined {
  if (titleId === null) {
    return undefined
  }

  return titles.find(title => title.id === titleId)
}

/**
 * Checks whether two employee Titles/Ranks are compatible.
 *
 * IMPORTANT:
 * Compatibility has NO direction.
 *
 * For example:
 *
 * Junior <-> S2 = incompatible
 *
 * It does not matter which one is In Charge or Member here.
 * Role permission is handled separately by permissions.ts.
 */
export function areTitlesCompatible(
  titleAId: number | null,
  titleBId: number | null,
  titles: EmployeeTitle[],
): boolean {
  // Employees without titles cannot safely participate
  // in automatic compatibility checking.
  if (titleAId === null || titleBId === null) {
    return false
  }

  /**
   * Same title is considered compatible with itself.
   *
   * This prevents you from having to explicitly store:
   *
   *   S2 -> S2
   *   Junior -> Junior
   *
   * in the compatibility table.
   */
  if (titleAId === titleBId) {
    return true
  }

  const titleA = findTitle(titles, titleAId)
  const titleB = findTitle(titles, titleBId)

  if (!titleA || !titleB) {
    return false
  }

  /**
   * Compatibility is conceptually non-directional.
   *
   * For now I accept the relationship if EITHER side contains the other.
   *
   * This is useful because your database may contain:
   *
   *   A -> B
   *
   * without separately storing:
   *
   *   B -> A
   *
   * We can tighten this later if your database guarantees both rows.
   */
  return (
    titleA.compatibleTitleIds.includes(titleBId) ||
    titleB.compatibleTitleIds.includes(titleAId)
  )
}