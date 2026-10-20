import {
  describe,
  expect,
  it,
} from 'vitest'

import { areTitlesCompatible } from './compatibility'

import {
  testTitles,
} from '../test/loadEmployeeSnapshot'

describe('Title compatibility', () => {
  it('allows compatible titles', () => {
    /**
     * From your real snapshot:
     *
     * Title 5 says it is compatible with:
     * 2, 4, 6
     */
    expect(
      areTitlesCompatible(
        5,
        6,
        testTitles,
      ),
    ).toBe(true)
  })

  it('rejects incompatible titles', () => {
    /**
     * Title 4 only lists:
     * 2, 5
     *
     * Therefore 4 + 6 should be incompatible.
     *
     * This is the important Junior/S2-style case.
     */
    expect(
      areTitlesCompatible(
        4,
        6,
        testTitles,
      ),
    ).toBe(false)
  })

  it('allows the same title with itself', () => {
    expect(
      areTitlesCompatible(
        5,
        5,
        testTitles,
      ),
    ).toBe(true)
  })

  it('rejects an unknown title', () => {
    expect(
      areTitlesCompatible(
        999,
        5,
        testTitles,
      ),
    ).toBe(false)
  })
})