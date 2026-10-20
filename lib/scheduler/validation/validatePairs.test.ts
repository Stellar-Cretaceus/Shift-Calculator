import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  findCompatiblePairs,
  canFormCompatiblePairs,
} from './validatePairs'

import {
  testTitles,
} from '../test/loadEmployeeSnapshot'

describe('Pair validation', () => {
  it('rejects an incompatible pair', () => {
    const inCharges = [
      {
        employeeId: 10,
        titleId: 6,
      },
    ]

    const members = [
      {
        employeeId: 15,
        titleId: 4,
      },
    ]

    expect(
      canFormCompatiblePairs(
        inCharges,
        members,
        testTitles,
      ),
    ).toBe(false)
  })

  it('accepts a compatible pair', () => {
    const inCharges = [
      {
        employeeId: 10,
        titleId: 6,
      },
    ]

    const members = [
      {
        employeeId: 4,
        titleId: 5,
      },
    ]

    expect(
      canFormCompatiblePairs(
        inCharges,
        members,
        testTitles,
      ),
    ).toBe(true)
  })

  it('finds a valid arrangement instead of pairing greedily', () => {
    /**
     * Two In Charges:
     *
     * Employee 10 → Title 6
     * Employee 4  → Title 5
     *
     * Two Members:
     *
     * Employee 15 → Title 4
     * Employee 5  → Title 5
     *
     *
     * Title 6 + Title 4 = incompatible
     *
     * So this would be BAD:
     *
     *   10 + 15  ❌
     *   4  + 5
     *
     *
     * But there is another arrangement:
     *
     *   10 + 5   ✅
     *   4  + 15  ✅
     *
     * Backtracking should discover it.
     */

    const inCharges = [
      {
        employeeId: 10,
        titleId: 6,
      },
      {
        employeeId: 4,
        titleId: 5,
      },
    ]

    const members = [
      {
        employeeId: 15,
        titleId: 4,
      },
      {
        employeeId: 5,
        titleId: 5,
      },
    ]

    const result = findCompatiblePairs(
      inCharges,
      members,
      testTitles,
    )

    expect(result).not.toBeNull()

    console.log('Pairing found:', result)
  })
})