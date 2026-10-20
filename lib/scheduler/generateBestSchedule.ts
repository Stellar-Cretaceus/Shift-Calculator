import {
  generateSchedule,
  type GenerateScheduleInput,
  type GenerateScheduleResult,
} from './generateSchedule'

const GENERATION_ATTEMPTS = 5

/**
 * Run the scheduler multiple times with different seeds
 * and keep the result with the fewest Open slots.
 *
 * V1 tie-break rule:
 * if two results have the same number of Open slots,
 * keep the first one.
 */
export function generateBestSchedule(
  input: GenerateScheduleInput,
): GenerateScheduleResult {

  const baseSeed =
    input.seed ??
    Date.now()

  let bestResult:
    GenerateScheduleResult | null =
    null


  for (
    let attempt = 0;
    attempt < GENERATION_ATTEMPTS;
    attempt++
  ) {

    const attemptSeed =
      baseSeed + attempt

    const result =
      generateSchedule({
        ...input,

        // Every attempt gets a different seed.
        seed: attemptSeed,
      })


    console.log(
      `[scheduler] attempt ${attempt + 1}/${GENERATION_ATTEMPTS}` +
      ` seed=${attemptSeed}` +
      ` open=${result.unfilledCount}` +
      ` generated=${result.totalGenerated}`,
    )


    /**
     * First result automatically becomes
     * the current best.
     */
    if (bestResult === null) {
      bestResult = result
      continue
    }


    /**
     * Primary objective:
     * fewer Open slots always wins.
     */
    if (
      result.unfilledCount <
      bestResult.unfilledCount
    ) {
      bestResult = result
    }


    /**
     * Perfect result:
     * cannot beat zero Open slots,
     * so we can stop early.
     */
    if (
      bestResult.unfilledCount === 0
    ) {
      break
    }
  }


  /**
   * This should always exist because
   * GENERATION_ATTEMPTS >= 1.
   */
  if (!bestResult) {
    throw new Error(
      'Scheduler failed to produce any generation result.',
    )
  }


  console.log(
    '[scheduler] selected best result',
    {
      seed:
        bestResult.seed,

      generated:
        bestResult.totalGenerated,

      unfilled:
        bestResult.unfilledCount,
    },
  )


  return bestResult
}