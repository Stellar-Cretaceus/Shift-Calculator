import {
  describe,
  expect,
  it,
} from 'vitest'

import type { ShiftTemplate } from '@/lib/types'

import {
  buildRequirements,
} from './buildRequirements'

describe('buildRequirements', () => {
  it('groups role requirements into one shift block', () => {
    const templates: ShiftTemplate[] = [
      {
        id: 1,
        locationId: 1,
        roleId: 5, // In Charge
        dayOfWeek: 1, // Monday
        categoryId: 1, // Morning
        requiredCount: 2,
      },

      {
        id: 2,
        locationId: 1,
        roleId: 6, // Member
        dayOfWeek: 1,
        categoryId: 1,
        requiredCount: 2,
      },
    ]

    const result = buildRequirements(
      templates,
      ['2026-09-28'], // Monday
    )

    expect(result).toHaveLength(1)

    expect(result[0]).toEqual({
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
    })
  })

  it('ignores templates from another weekday', () => {
    const templates: ShiftTemplate[] = [
      {
        id: 1,
        locationId: 1,
        roleId: 5,
        dayOfWeek: 2, // Tuesday
        categoryId: 1,
        requiredCount: 2,
      },
    ]

    const result = buildRequirements(
      templates,
      ['2026-09-28'], // Monday
    )

    expect(result).toEqual([])
  })

  it('creates separate blocks for different categories', () => {
    const templates: ShiftTemplate[] = [
      {
        id: 1,
        locationId: 1,
        roleId: 5,
        dayOfWeek: 1,
        categoryId: 1, // Morning
        requiredCount: 2,
      },

      {
        id: 2,
        locationId: 1,
        roleId: 5,
        dayOfWeek: 1,
        categoryId: 2, // Noon
        requiredCount: 2,
      },
    ]

    const result = buildRequirements(
      templates,
      ['2026-09-28'],
    )

    expect(result).toHaveLength(2)
  })
})