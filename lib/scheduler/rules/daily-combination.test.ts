
import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  checkDailyCombination,
  isDailyCombinationAllowed,
} from './daily-combination'


describe('Daily shift combinations', () => {

  it('allows Morning + Noon', () => {
    expect(
      isDailyCombinationAllowed(
        ['morning'],
        'noon',
      ),
    ).toBe(true)
  })


  it('allows Morning + Night', () => {
    expect(
      isDailyCombinationAllowed(
        ['morning'],
        'night',
      ),
    ).toBe(true)
  })


  it('rejects Noon + Night', () => {
    const result =
      checkDailyCombination(
        ['noon'],
        'night',
      )

    expect(
      result.allowed,
    ).toBe(false)

    expect(
      result.reasons,
    ).toContain(
      'NOON_NIGHT_COMBINATION',
    )
  })


  it('rejects Night + Noon', () => {
    expect(
      isDailyCombinationAllowed(
        ['night'],
        'noon',
      ),
    ).toBe(false)
  })


  it('rejects duplicate Morning', () => {
    const result =
      checkDailyCombination(
        ['morning'],
        'morning',
      )

    expect(
      result.allowed,
    ).toBe(false)

    expect(
      result.reasons,
    ).toContain(
      'DUPLICATE_TIME_OF_DAY',
    )
  })


  it('rejects a third normal shift', () => {
    const result =
      checkDailyCombination(
        [
          'morning',
          'noon',
        ],
        'night',
      )

    expect(
      result.allowed,
    ).toBe(false)

    expect(
      result.reasons,
    ).toContain(
      'TOO_MANY_NORMAL_SHIFTS',
    )
  })


  it('allows a single shift on an empty day', () => {
    expect(
      isDailyCombinationAllowed(
        [],
        'morning',
      ),
    ).toBe(true)
  })

})
