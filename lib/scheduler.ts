/**
 * Pure shift-generation logic. Given the recurring shift templates (rules),
 * the roster of employees (with their qualified roles and weekly availability),
 * and a week start date, it produces concrete shift assignments.
 *
 * Assignment strategy: greedy with load balancing. For each open slot we pick
 * the eligible employee with the fewest hours assigned so far, so work is
 * spread fairly. Slots with no eligible employee are left open (employeeId null).
 */

export type TemplateInput = {
  id: number
  locationId: number
  roleId: number
  dayOfWeek: number
  startTime: string
  endTime: string
  requiredCount: number
}

export type AvailabilityInput = {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export type EmployeeInput = {
  id: number
  maxHoursPerWeek: number
  roleIds: number[]
  availability: AvailabilityInput[]
}

export type GeneratedShift = {
  locationId: number
  roleId: number
  employeeId: number | null
  date: string
  startTime: string
  endTime: string
}

/** "HH:MM" -> minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Duration of a shift in hours. */
export function shiftHours(start: string, end: string): number {
  return (toMinutes(end) - toMinutes(start)) / 60
}

/** Does [aStart,aEnd) fully contain [bStart,bEnd)? */
function contains(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toMinutes(aStart) <= toMinutes(bStart) && toMinutes(aEnd) >= toMinutes(bEnd)
}

/** Do [aStart,aEnd) and [bStart,bEnd) overlap? */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd)
}

/** Format a Date as YYYY-MM-DD in local time. */
export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function generateSchedule(
  templates: TemplateInput[],
  employees: EmployeeInput[],
  weekStart: Date,
): GeneratedShift[] {
  const results: GeneratedShift[] = []

  // Track assigned hours per employee, and shifts per employee per date to
  // prevent double-booking overlapping shifts.
  const assignedHours = new Map<number, number>()
  const assignedByDate = new Map<string, { start: string; end: string }[]>()

  const keyFor = (empId: number, date: string) => `${empId}::${date}`

  // Process templates in a stable order for deterministic output.
  const ordered = [...templates].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek || toMinutes(a.startTime) - toMinutes(b.startTime),
  )

  for (const t of ordered) {
    // Concrete date = weekStart + offset so that its weekday === t.dayOfWeek.
    const date = new Date(weekStart)
    const offset = (t.dayOfWeek - weekStart.getDay() + 7) % 7
    date.setDate(weekStart.getDate() + offset)
    const dateStr = formatDate(date)
    const duration = shiftHours(t.startTime, t.endTime)

    for (let slot = 0; slot < t.requiredCount; slot++) {
      const eligible = employees
        .filter((emp) => {
          // Must be qualified for the role.
          if (!emp.roleIds.includes(t.roleId)) return false
          // Must be available on this weekday covering the whole shift.
          const avail = emp.availability.some(
            (a) =>
              a.dayOfWeek === t.dayOfWeek &&
              contains(a.startTime, a.endTime, t.startTime, t.endTime),
          )
          if (!avail) return false
          // Must not exceed max weekly hours.
          const current = assignedHours.get(emp.id) ?? 0
          if (current + duration > emp.maxHoursPerWeek) return false
          // Must not overlap an already-assigned shift the same day.
          const dayShifts = assignedByDate.get(keyFor(emp.id, dateStr)) ?? []
          if (
            dayShifts.some((s) => overlaps(s.start, s.end, t.startTime, t.endTime))
          )
            return false
          return true
        })
        // Prefer the least-loaded employee for fairness.
        .sort(
          (a, b) =>
            (assignedHours.get(a.id) ?? 0) - (assignedHours.get(b.id) ?? 0),
        )

      const chosen = eligible[0] ?? null

      if (chosen) {
        assignedHours.set(
          chosen.id,
          (assignedHours.get(chosen.id) ?? 0) + duration,
        )
        const k = keyFor(chosen.id, dateStr)
        const arr = assignedByDate.get(k) ?? []
        arr.push({ start: t.startTime, end: t.endTime })
        assignedByDate.set(k, arr)
      }

      results.push({
        locationId: t.locationId,
        roleId: t.roleId,
        employeeId: chosen ? chosen.id : null,
        date: dateStr,
        startTime: t.startTime,
        endTime: t.endTime,
      })
    }
  }

  return results
}
