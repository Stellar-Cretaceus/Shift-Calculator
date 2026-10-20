import {
  describe,
  expect,
  it,
} from 'vitest'

import type { ShiftBlock } from '../types'

import {
  createShiftBlockState,
  getRemainingCount,
  hasOpenRoleSlot,
  simulateAssignment,
} from './blockState'

describe('Shift block state', () => {
  const block: ShiftBlock = {
    date: '2026-09-28',
    locationId: 1,
    categoryId: 1,

    requirements: [
      {
        roleId: 5,
        requiredCount: 2,
      },
      {
        roleId: 6,
        requiredCount: 2,
      },
    ],
  }

  it('starts with all slots empty', () => {
    const state = createShiftBlockState(block)

    expect(
      getRemainingCount(state, 5),
    ).toBe(2)

    expect(
      getRemainingCount(state, 6),
    ).toBe(2)
  })

  it('reduces the remaining count after simulation', () => {
    const state = createShiftBlockState(block)

    const simulated = simulateAssignment(
      state,
      {
        employeeId: 10,
        titleId: 6,
        roleId: 5,
      },
    )

    expect(
      getRemainingCount(simulated, 5),
    ).toBe(1)

    /**
     * Important:
     *
     * original state was NOT modified.
     */
    expect(
      getRemainingCount(state, 5),
    ).toBe(2)
  })

  it('knows when a role is full', () => {
    let state = createShiftBlockState(block)

    state = simulateAssignment(
      state,
      {
        employeeId: 10,
        titleId: 6,
        roleId: 5,
      },
    )

    state = simulateAssignment(
      state,
      {
        employeeId: 11,
        titleId: 6,
        roleId: 5,
      },
    )

    expect(
      hasOpenRoleSlot(state, 5),
    ).toBe(false)

    expect(
      hasOpenRoleSlot(state, 6),
    ).toBe(true)
  })
})