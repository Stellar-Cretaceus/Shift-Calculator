/**
 * Format a Date as YYYY-MM-DD using local time.
 */
export function formatDate(
  date: Date,
): string {
  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, '0')

  const day =
    String(
      date.getDate(),
    ).padStart(2, '0')

  return `${year}-${month}-${day}`
}


/**
 * Generate every YYYY-MM-DD date from startDate through endDate,
 * inclusive.
 */
export function getDatesInRange(
  startDate: string,
  endDate: string,
): string[] {
  const dates: string[] = []

  const current =
    new Date(
      `${startDate}T00:00:00`,
    )

  const end =
    new Date(
      `${endDate}T00:00:00`,
    )


  while (current <= end) {
    dates.push(
      formatDate(current),
    )

    current.setDate(
      current.getDate() + 1,
    )
  }


  return dates
}


/**
 * Convert HH:MM to minutes after midnight.
 */
function toMinutes(
  time: string,
): number {
  const [hours, minutes] =
    time
      .split(':')
      .map(Number)

  return (
    hours * 60 +
    minutes
  )
}


/**
 * Calculate duration of a shift in hours.
 *
 * Also handles overnight shifts.
 *
 * Example:
 * 22:00 -> 06:00
 * = 8 hours
 */
export function shiftHours(
  start: string,
  end: string,
): number {
  const startMinutes =
    toMinutes(start)

  let endMinutes =
    toMinutes(end)


  if (
    endMinutes <=
    startMinutes
  ) {
    endMinutes +=
      24 * 60
  }


  return (
    endMinutes -
    startMinutes
  ) / 60
}