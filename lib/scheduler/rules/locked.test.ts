
import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  Shift,
  ShiftCategory,
} from '@/lib/types'

import {
  hasVacationOnDate,
  isBlockedByLockedShift,
  isNormalSlotBlockedBySpecial,
} from './locked'


describe('Locked shift rules', () => {
  const categories: ShiftCategory[] = [
    {
      id: 1,
      userId: 'test',
      name: 'Morning',
      startTime: '08:00',
      endTime: '12:00',
      type: 'regular',
      abbreviation: 'M',
      timeOfDay: 'morning',
      color: '#000000',
      createdAt: new Date(),
    },

    {
      id: 10,
      userId: 'test',
      name: 'Seminar',
      startTime: '08:00',
      endTime: '12:00',
      type: 'special',
      abbreviation: 'SEM',
      timeOfDay: 'morning',
      color: '#000000',
      createdAt: new Date(),
    },

    {
      id: 20,
      userId: 'test',
      name: 'Vacation',
      startTime: '00:00',
      endTime: '00:00',
      type: 'vacation',
      abbreviation: 'VAC',
      timeOfDay: 'none',
      color: '#000000',
      createdAt: new Date(),
    },
  ]


  it('vacation blocks the whole day', () => {
    const shifts: Shift[] = [
      {
        id: 1,
        locationId: 1,
        roleId: null,
        employeeId: 100,
        date: '2026-09-28',
        categoryId: 20,
      },
    ]

    expect(
      hasVacationOnDate(
        100,
        '2026-09-28',
        shifts,
        categories,
      ),
    ).toBe(true)

    expect(
      isBlockedByLockedShift(
        100,
        '2026-09-28',
        'morning',
        shifts,
        categories,
      ),
    ).toBe(true)

    expect(
      isBlockedByLockedShift(
        100,
        '2026-09-28',
        'night',
        shifts,
        categories,
      ),
    ).toBe(true)
  })


  it('special morning blocks only morning', () => {
    const shifts: Shift[] = [
      {
        id: 2,
        locationId: 1,
        roleId: null,
        employeeId: 100,
        date: '2026-09-28',
        categoryId: 10,
      },
    ]

    expect(
      isNormalSlotBlockedBySpecial(
        100,
        '2026-09-28',
        'morning',
        shifts,
        categories,
      ),
    ).toBe(true)

    expect(
      isBlockedByLockedShift(
        100,
        '2026-09-28',
        'morning',
        shifts,
        categories,
      ),
    ).toBe(true)

    expect(
      isBlockedByLockedShift(
        100,
        '2026-09-28',
        'noon',
        shifts,
        categories,
      ),
    ).toBe(false)
  })
})
