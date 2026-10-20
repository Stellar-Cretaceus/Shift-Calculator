import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  checkShiftSequence,
  isShiftSequenceAllowed,
} from './sequence'


describe('Shift sequence rules', () => {

  it('rejects Morning after previous-day Night', () => {
    const result =
      checkShiftSequence(
        ['night'],
        'morning',
        [],
      )

    expect(
      result.allowed,
    ).toBe(false)

    expect(
      result.reasons,
    ).toContain(
      'NIGHT_BEFORE_MORNING',
    )
  })


  it('rejects Night before next-day Morning', () => {
    const result =
      checkShiftSequence(
        [],
        'night',
        ['morning'],
      )

    expect(
      result.allowed,
    ).toBe(false)

    expect(
      result.reasons,
    ).toContain(
      'NIGHT_BEFORE_MORNING',
    )
  })


  it('allows Morning after previous-day Noon', () => {
    expect(
      isShiftSequenceAllowed(
        ['noon'],
        'morning',
        [],
      ),
    ).toBe(true)
  })


  it('allows Noon after previous-day Night', () => {
    expect(
      isShiftSequenceAllowed(
        ['night'],
        'noon',
        [],
      ),
    ).toBe(true)
  })


  it('allows Night before next-day Noon', () => {
    expect(
      isShiftSequenceAllowed(
        [],
        'night',
        ['noon'],
      ),
    ).toBe(true)
  })


  it('allows Morning when surrounding days are empty', () => {
    expect(
      isShiftSequenceAllowed(
        [],
        'morning',
        [],
      ),
    ).toBe(true)
  })

})