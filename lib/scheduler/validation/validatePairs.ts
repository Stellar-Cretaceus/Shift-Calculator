import type { EmployeeTitle } from '@/lib/types'
import { areTitlesCompatible } from '../rules/compatibility'

/**
 * We don't need the whole Employee object when validating a pair.
 *
 * Pairing only cares about:
 * - who the employee is
 * - what Title/Rank they have
 */
export type PairPerson = {
  employeeId: number
  titleId: number | null
}

export type EmployeePair = {
  inCharge: PairPerson
  member: PairPerson
}

/**
 * Try to find a complete legal pairing.
 *
 * Example:
 *
 * In Charge:
 *   A
 *   B
 *
 * Members:
 *   C
 *   D
 *
 * We need:
 *
 *   A + someone
 *   B + someone
 *
 * where everybody is used exactly once.
 *
 *
 * IMPORTANT:
 * This does NOT greedily commit to the first valid partner.
 *
 * It uses backtracking:
 *
 *   Try A+C
 *       ↓
 *   B cannot pair with D
 *       ↓
 *   Undo A+C
 *       ↓
 *   Try A+D
 *       ↓
 *   Try B+C
 *       ↓
 *   Success
 */
export function findCompatiblePairs(
  inCharges: PairPerson[],
  members: PairPerson[],
  titles: EmployeeTitle[],
): EmployeePair[] | null {
  // A complete set of pairs requires equal numbers.
  if (inCharges.length !== members.length) {
    return null
  }

  const usedMemberIndexes = new Set<number>()
  const result: EmployeePair[] = []

  /**
   * Recursive search.
   *
   * "Recursive" means this function calls itself to solve
   * the next smaller part of the problem.
   */
  function search(inChargeIndex: number): boolean {
    /**
     * If we've successfully assigned every In Charge,
     * we found a complete matching.
     */
    if (inChargeIndex >= inCharges.length) {
      return true
    }

    const inCharge = inCharges[inChargeIndex]

    // Try every Member who has not already been used.
    for (
      let memberIndex = 0;
      memberIndex < members.length;
      memberIndex++
    ) {
      if (usedMemberIndexes.has(memberIndex)) {
        continue
      }

      const member = members[memberIndex]

      // Skip incompatible titles.
      if (
        !areTitlesCompatible(
          inCharge.titleId,
          member.titleId,
          titles,
        )
      ) {
        continue
      }

      /**
       * Tentatively choose this Member.
       *
       * Nothing is permanently committed yet.
       */
      usedMemberIndexes.add(memberIndex)

      result.push({
        inCharge,
        member,
      })

      /**
       * Now try solving the remaining people.
       */
      const remainingWorked = search(inChargeIndex + 1)

      if (remainingWorked) {
        return true
      }

      /**
       * This choice eventually caused a dead end.
       *
       * Undo it and try another Member.
       *
       * This undo step is the "backtracking" part.
       */
      result.pop()
      usedMemberIndexes.delete(memberIndex)
    }

    // None of the possible Members worked.
    return false
  }

  const success = search(0)

  if (!success) {
    return null
  }

  return result
}

/**
 * Convenience version for when we only care whether
 * pairing is possible, not what the actual pairs are.
 */
export function canFormCompatiblePairs(
  inCharges: PairPerson[],
  members: PairPerson[],
  titles: EmployeeTitle[],
): boolean {
  return findCompatiblePairs(
    inCharges,
    members,
    titles,
  ) !== null
}