import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  EmployeeTitle,
} from '@/lib/types'

import {
  getAllowedDaysForTitle,
  isMandatoryWorkDate,
  isTitleAvailableOnDate,
  parseCustomDays,
} from './availability'


describe('Availability rules', () => {

  it('parses custom day strings', () => {
    expect(
      parseCustomDays('1,2,3,4,5'),
    ).toEqual([
      1, 2, 3, 4, 5,
    ])
  })


  it('official workers work Monday-Friday', () => {
    const title: EmployeeTitle = {
      id: 1,
      name: 'Official',

      workingTimePattern: 'official',
      customDays: '1,2,3,4,5',

      restOnHoliday: true,
      mustWorkAllAvailable: true,

      allowedRoleIds: [],
      compatibleTitleIds: [],
      allowedCategoryIds: [],
      allowedLocationIds: [],
    }

    expect(
      getAllowedDaysForTitle(title),
    ).toEqual([
      1, 2, 3, 4, 5,
    ])
  })


  it('official worker is available on Monday', () => {
    const title: EmployeeTitle = {
      id: 1,
      name: 'Official',

      workingTimePattern: 'official',
      customDays: '1,2,3,4,5',

      restOnHoliday: true,
      mustWorkAllAvailable: true,

      allowedRoleIds: [],
      compatibleTitleIds: [],
      allowedCategoryIds: [],
      allowedLocationIds: [],
    }

    expect(
      isTitleAvailableOnDate(
        title,

        // Monday
        '2026-09-28',

        false,
      ),
    ).toBe(true)
  })


  it('official worker is unavailable on Sunday', () => {
    const title: EmployeeTitle = {
      id: 1,
      name: 'Official',

      workingTimePattern: 'official',
      customDays: '1,2,3,4,5',

      restOnHoliday: true,
      mustWorkAllAvailable: true,

      allowedRoleIds: [],
      compatibleTitleIds: [],
      allowedCategoryIds: [],
      allowedLocationIds: [],
    }

    expect(
      isTitleAvailableOnDate(
        title,

        // Sunday
        '2026-09-27',

        false,
      ),
    ).toBe(false)
  })


  it('respects restOnHoliday', () => {
    const title: EmployeeTitle = {
      id: 1,
      name: 'Official',

      workingTimePattern: 'official',
      customDays: '1,2,3,4,5',

      restOnHoliday: true,
      mustWorkAllAvailable: true,

      allowedRoleIds: [],
      compatibleTitleIds: [],
      allowedCategoryIds: [],
      allowedLocationIds: [],
    }

    expect(
      isTitleAvailableOnDate(
        title,

        // Normally a valid Monday.
        '2026-09-28',

        // But this date is a holiday.
        true,
      ),
    ).toBe(false)
  })


  it('shift workers use their configured days', () => {
    const title: EmployeeTitle = {
      id: 2,
      name: 'Shift',

      workingTimePattern: 'shift',
      customDays: '0,1,2,3,4,5,6',

      restOnHoliday: false,
      mustWorkAllAvailable: false,

      allowedRoleIds: [],
      compatibleTitleIds: [],
      allowedCategoryIds: [],
      allowedLocationIds: [],
    }

    expect(
      isTitleAvailableOnDate(
        title,
        '2026-09-27',
        false,
      ),
    ).toBe(true)
  })


  it('recognizes mandatory available workdays', () => {
    const title: EmployeeTitle = {
      id: 1,
      name: 'Official',

      workingTimePattern: 'official',
      customDays: '1,2,3,4,5',

      restOnHoliday: true,
      mustWorkAllAvailable: true,

      allowedRoleIds: [],
      compatibleTitleIds: [],
      allowedCategoryIds: [],
      allowedLocationIds: [],
    }

    expect(
      isMandatoryWorkDate(
        title,
        '2026-09-28',
        false,
      ),
    ).toBe(true)
  })

})