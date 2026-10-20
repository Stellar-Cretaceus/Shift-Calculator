/**
 * IMPORTANT DEBUG SWITCH
 *
 * false = normal mode:
 *         seed comes from current time
 *
 * true  = debug mode:
 *         always use DEBUG_SEED
 */
export const DEBUG_RANDOM = false

/**
 * Keep this constant while debugging.
 *
 * If something weird happens, using the same seed
 * should reproduce the same random decisions.
 */
export const DEBUG_SEED = 123456789


/**
 * Create the seed used for one scheduler generation.
 *
 * Normal mode:
 *   Date.now()
 *
 * Debug mode:
 *   fixed DEBUG_SEED
 */
export function createSchedulerSeed(): number {
  const seed =
    DEBUG_RANDOM
      ? DEBUG_SEED
      : Date.now()

  console.log(
    `[scheduler] Random seed: ${seed}` +
    (DEBUG_RANDOM ? ' [DEBUG]' : ''),
  )

  return seed
}


/**
 * Small deterministic pseudo-random number generator.
 *
 * Same seed
 *   -> same sequence of random numbers.
 *
 * Returns values:
 *
 * 0 <= number < 1
 */
export function createSeededRandom(
  seed: number,
): () => number {
  let state =
    seed >>> 0

  return () => {
    state += 0x6D2B79F5

    let value = state

    value =
      Math.imul(
        value ^ (value >>> 15),
        value | 1,
      )

    value ^=
      value +
      Math.imul(
        value ^ (value >>> 7),
        value | 61,
      )

    return (
      (
        value ^
        (value >>> 14)
      ) >>> 0
    ) / 4294967296
  }
}


/**
 * Pick an integer:
 *
 * 0 <= result < max
 */
export function randomInt(
  random: () => number,
  max: number,
): number {
  if (max <= 0) {
    return 0
  }

  return Math.floor(
    random() * max,
  )
}


/**
 * Randomly shuffle an array WITHOUT changing
 * the original array.
 *
 * Uses Fisher-Yates shuffle.
 */
export function shuffleWithRandom<T>(
  items: T[],
  random: () => number,
): T[] {
  const result = [
    ...items,
  ]

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {
    const j =
      randomInt(
        random,
        i + 1,
      )

    ;[
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ]
  }

  return result
}