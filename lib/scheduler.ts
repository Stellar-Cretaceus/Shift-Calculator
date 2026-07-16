/**
 * Pure shift-generation logic. 
 * Supports flexible date ranges and handles mandatory fixed schedules 
 * before backfilling with casual staff using a fairness algorithm.
 */

export type TemplateInput = {
  id: number
  locationId: number
  roleId: number
  dayOfWeek: number
  categoryId: number
  requiredCount: number
}

export type AvailabilityInput = {
  dayOfWeek: number
  categoryId: number
  isMandatory: boolean
}

export type EmployeeInput = {
  id: number
  maxHoursPerWeek: number 
  roleIds: number[]
  availability: AvailabilityInput[]
  mustWorkAllAvailable: boolean
  canRestOnHolidays: boolean
  allowedCategoryIds: number[]
  allowedDays: number[]
}

export type GeneratedShift = {
  locationId: number
  roleId: number | null
  employeeId: number | null
  date: string
  categoryId: number
}

/** "HH:MM" -> minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Duration of a shift in hours, safely handling midnight wraps. Used by UI. */
export function shiftHours(start: string, end: string): number {
  const startMins = toMinutes(start)
  let endMins = toMinutes(end)

  if (endMins <= startMins) {
    endMins += 24 * 60
  }

  return (endMins - startMins) / 60
}

/** Format a Date as YYYY-MM-DD in local time. */
export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Generates an array of date strings between start and end (inclusive) */
export function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  const dates = []
  const currentDate = new Date(`${startDateStr}T00:00:00`)
  const endDate = new Date(`${endDateStr}T00:00:00`)

  while (currentDate <= endDate) {
    dates.push(formatDate(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }
  return dates
}

export function generateSchedule(
  templates: TemplateInput[],
  employees: EmployeeInput[],
  datesToSchedule: string[],
  holidayDates: string[],
  categories: { id: number; name: string; startTime: string; endTime: string; timeOfDay: string; type: string }[],
  existingShifts: GeneratedShift[] = []
): GeneratedShift[] {
  let results: GeneratedShift[] = existingShifts.map(s => ({ ...s }))

  const assignedShiftCount = new Map<number, number>()
  const categoryShiftCount = new Map<string, number>()
  const accumulatedOffDays = new Map<number, number>()

  for (const shift of results) {
    if (shift.employeeId) {
      const empId = Number(shift.employeeId)
      const cat = categories.find(c => Number(c.id) === Number(shift.categoryId))
      
      const isOff = cat?.type === 'off' || cat?.name === 'OFF (Lock)'
      const isVac = cat?.type === 'vacation' || cat?.name === 'ลาหยุด'

      if (isOff || isVac) {
        accumulatedOffDays.set(empId, (accumulatedOffDays.get(empId) ?? 0) + 1)
      } else if (shift.roleId) {
        assignedShiftCount.set(empId, (assignedShiftCount.get(empId) ?? 0) + 1)
        const catKey = `${empId}-${Number(shift.categoryId)}`
        categoryShiftCount.set(catKey, (categoryShiftCount.get(catKey) ?? 0) + 1)
      }
    }
  }

  const getShiftTypeConstant = (catId: number | string) => {
    const cat = categories.find(c => Number(c.id) === Number(catId))
    if (!cat || cat.timeOfDay === 'none') return null
    return cat.timeOfDay
  }

  // 🌟 THE ELASTIC COOLDOWN: Replaces the hard block with a sliding scale penalty
  const getDoubleShiftProximityPenalty = (empId: number, baseDateStr: string, currentResults: GeneratedShift[]) => {
    let penalty = 0
    const offsets = [-4, -3, -2, -1, 1, 2, 3, 4]
    for (const offset of offsets) {
      const d = new Date(`${baseDateStr}T00:00:00`)
      d.setDate(d.getDate() + offset)
      const checkDateStr = formatDate(d)

      const shiftsOnDay = currentResults.filter(s => s.date === checkDateStr && Number(s.employeeId) === Number(empId) && s.roleId !== null && categories.find(c => Number(c.id) === Number(s.categoryId))?.type !== 'off' && categories.find(c => Number(c.id) === Number(s.categoryId))?.type !== 'vacation')

      if (shiftsOnDay.length >= 2) {
        const absOffset = Math.abs(offset)
        if (absOffset === 1) penalty += 100 // 1 day gap: Extreme penalty (prevents back-to-back)
        else if (absOffset === 2) penalty += 40  // 2 day gap: High penalty
        else if (absOffset === 3) penalty += 25  // 3 day gap: Moderate penalty
        else if (absOffset === 4) penalty += 10  // 4 day gap: Minor penalty
      }
    }
    return penalty
  }

  // 🌟 HARD STAMINA CAP: Prevents 6+ consecutive days of working
  const checkStaminaBreak = (empId: number, baseDateStr: string, currentResults: GeneratedShift[]) => {
    let consecutiveDays = 0
    for (let offset = -1; offset >= -6; offset--) {
        const d = new Date(`${baseDateStr}T00:00:00`)
        d.setDate(d.getDate() + offset)
        const checkDateStr = formatDate(d)

        const worked = currentResults.some(s => s.date === checkDateStr && Number(s.employeeId) === Number(empId) && s.roleId !== null && categories.find(c => Number(c.id) === Number(s.categoryId))?.type !== 'off' && categories.find(c => Number(c.id) === Number(s.categoryId))?.type !== 'vacation')
        if (worked) consecutiveDays++
        else break
    }
    if (consecutiveDays >= 6) return true 
    return false
  }

  for (let idx = 0; idx < datesToSchedule.length; idx++) {
    const dateStr = datesToSchedule[idx]
    const isHoliday = holidayDates.includes(dateStr)
    const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay()
    
    const currentD = new Date(`${dateStr}T00:00:00`)
    const prevD = new Date(currentD)
    prevD.setDate(prevD.getDate() - 1)
    const yesterdayStr = formatDate(prevD)

    const typeOrder: Record<string, number> = { morning: 1, noon: 2, night: 3, none: 4 }
    let remainingTemplates = templates
      .filter((t) => t.dayOfWeek === dayOfWeek)
      .map((t) => ({ ...t, remainingCount: t.requiredCount }))
      .sort((a, b) => {
        const orderA = typeOrder[getShiftTypeConstant(a.categoryId) ?? 'none']
        const orderB = typeOrder[getShiftTypeConstant(b.categoryId) ?? 'none']
        return orderA - orderB
      })

    // --- PHASE 0 - RECONCILE MANUAL LOCKS ---
    const preLockedToday = results.filter(r => r.date === dateStr && r.employeeId !== null)
    
    for (const lockedShift of preLockedToday) {
      const cat = categories.find(c => Number(c.id) === Number(lockedShift.categoryId))
      const isOff = cat?.type === 'off' || cat?.name === 'OFF (Lock)'
      const isVac = cat?.type === 'vacation' || cat?.name === 'ลาหยุด'
      
      if (isOff || isVac) continue; 

      if (lockedShift.roleId) {
        const matchingTemplate = remainingTemplates.find(t => 
          Number(t.categoryId) === Number(lockedShift.categoryId) && 
          Number(t.roleId) === Number(lockedShift.roleId) &&
          t.remainingCount > 0
        )
        if (matchingTemplate) matchingTemplate.remainingCount--;
      } else {
        const emp = employees.find(e => Number(e.id) === Number(lockedShift.employeeId))
        if (!emp) continue;

        const matchingTemplate = remainingTemplates.find(t => 
          Number(t.categoryId) === Number(lockedShift.categoryId) && 
          emp.roleIds.map(Number).includes(Number(t.roleId)) &&
          t.remainingCount > 0
        )

        if (matchingTemplate) {
          lockedShift.roleId = matchingTemplate.roleId 
          matchingTemplate.remainingCount--
          
          assignedShiftCount.set(Number(emp.id), (assignedShiftCount.get(Number(emp.id)) ?? 0) + 1)
          const catKey = `${Number(emp.id)}-${Number(lockedShift.categoryId)}`
          categoryShiftCount.set(catKey, (categoryShiftCount.get(catKey) ?? 0) + 1)
        }
      }
    }

    // --- PHASE 1: MANDATORY STAFF PASS ---
    for (const emp of employees) {
      if (isHoliday && emp.canRestOnHolidays) continue

      const isUnavailableToday = results.some(r => {
        if (r.date !== dateStr || Number(r.employeeId) !== Number(emp.id)) return false
        const cat = categories.find(c => Number(c.id) === Number(r.categoryId))
        const isOff = cat?.type === 'off' || cat?.name === 'OFF (Lock)'
        const isVac = cat?.type === 'vacation' || cat?.name === 'ลาหยุด'
        return !r.roleId || isOff || isVac
      })
      if (isUnavailableToday) continue

      const mandatoryAvail = emp.availability.find((a) => a.dayOfWeek === dayOfWeek && a.isMandatory === true)

      if (mandatoryAvail) {
        const matchingTemplateIndex = remainingTemplates.findIndex((t) => {
          if (Number(t.categoryId) !== Number(mandatoryAvail.categoryId) || !emp.roleIds.map(Number).includes(Number(t.roleId)) || t.remainingCount <= 0) return false

          const targetType = getShiftTypeConstant(t.categoryId)
          const shiftsToday = results.filter(r => r.date === dateStr && Number(r.employeeId) === Number(emp.id))
          const hasNoonToday = shiftsToday.some(s => getShiftTypeConstant(s.categoryId) === 'noon')
          const hasNightToday = shiftsToday.some(s => getShiftTypeConstant(s.categoryId) === 'night')
          
          if (shiftsToday.some(s => Number(s.categoryId) === Number(t.categoryId))) return false

          // Hard daily caps
          if (shiftsToday.length >= 2) return false
          if (checkStaminaBreak(emp.id, dateStr, results)) return false

          if (targetType === 'noon' && hasNightToday) return false
          if (targetType === 'night' && hasNoonToday) return false

          if (yesterdayStr) {
            const shiftsYesterday = results.filter(r => r.date === yesterdayStr && Number(r.employeeId) === Number(emp.id))
            const hasNightYesterday = shiftsYesterday.some(s => getShiftTypeConstant(s.categoryId) === 'night')
            if (targetType === 'morning' && hasNightYesterday) return false
          }

          return true
        })

        if (matchingTemplateIndex !== -1) {
          const t = remainingTemplates[matchingTemplateIndex]
          results.push({ locationId: t.locationId, roleId: t.roleId, employeeId: emp.id, date: dateStr, categoryId: t.categoryId })
          t.remainingCount -= 1
          
          assignedShiftCount.set(Number(emp.id), (assignedShiftCount.get(Number(emp.id)) ?? 0) + 1)
          const catKey = `${Number(emp.id)}-${Number(t.categoryId)}`
          categoryShiftCount.set(catKey, (categoryShiftCount.get(catKey) ?? 0) + 1)
        }
      }
    }

    // --- PHASE 2: CASUAL STAFF LOTTERY BACKFILL ---
    for (const t of remainingTemplates) {
      for (let slot = 0; slot < t.remainingCount; slot++) {
        const eligible = employees.filter((emp) => {
          if (isHoliday && emp.canRestOnHolidays) return false
          if (!emp.allowedDays.includes(dayOfWeek)) return false

          const isUnavailableToday = results.some(r => {
            if (r.date !== dateStr || Number(r.employeeId) !== Number(emp.id)) return false
            const cat = categories.find(c => Number(c.id) === Number(r.categoryId))
            const isOff = cat?.type === 'off' || cat?.name === 'OFF (Lock)'
            const isVac = cat?.type === 'vacation' || cat?.name === 'ลาหยุด'
            return !r.roleId || isOff || isVac
          })
          if (isUnavailableToday) return false

          if (!emp.allowedCategoryIds.map(Number).includes(Number(t.categoryId)) || !emp.roleIds.map(Number).includes(Number(t.roleId))) return false

          const targetType = getShiftTypeConstant(t.categoryId)
          const shiftsToday = results.filter(r => r.date === dateStr && Number(r.employeeId) === Number(emp.id))
          const hasNoonToday = shiftsToday.some(s => getShiftTypeConstant(s.categoryId) === 'noon')
          const hasNightToday = shiftsToday.some(s => getShiftTypeConstant(s.categoryId) === 'night')
          
          if (shiftsToday.some(s => Number(s.categoryId) === Number(t.categoryId))) return false

          // Hard daily caps
          if (shiftsToday.length >= 2) return false
          if (checkStaminaBreak(emp.id, dateStr, results)) return false

          if (targetType === 'noon' && hasNightToday) return false
          if (targetType === 'night' && hasNoonToday) return false

          if (yesterdayStr) {
            const shiftsYesterday = results.filter(r => r.date === yesterdayStr && Number(r.employeeId) === Number(emp.id))
            const hasNightYesterday = shiftsYesterday.some(s => getShiftTypeConstant(s.categoryId) === 'night')
            if (targetType === 'morning' && hasNightYesterday) return false
          }

          return true
        })

        const eligibleWithTickets = eligible.map(emp => {
          const offCount = accumulatedOffDays.get(Number(emp.id)) ?? 0
          return {
            emp,
            lotteryScore: Math.random() * (offCount + 1)
          }
        })

        eligibleWithTickets.sort((aObj, bObj) => {
          const a = aObj.emp
          const b = bObj.emp

          const aIsLocked = results.some(s => Number(s.employeeId) === Number(a.id) && Number(s.categoryId) === Number(t.categoryId) && (!s.roleId || categories.find(c => c.id === s.categoryId)?.type === 'off') && s.date === dateStr)
          const bIsLocked = results.some(s => Number(s.employeeId) === Number(b.id) && Number(s.categoryId) === Number(t.categoryId) && (!s.roleId || categories.find(c => c.id === s.categoryId)?.type === 'off') && s.date === dateStr)
          if (aIsLocked && !bIsLocked) return -1
          if (bIsLocked && !aIsLocked) return 1

          const aNeedsShift = a.mustWorkAllAvailable && !results.some(s => s.date === dateStr && Number(s.employeeId) === Number(a.id))
          const bNeedsShift = b.mustWorkAllAvailable && !results.some(s => s.date === dateStr && Number(s.employeeId) === Number(b.id))
          if (aNeedsShift && !bNeedsShift) return -1
          if (bNeedsShift && !aNeedsShift) return 1
          
          const aMonthlyShifts = assignedShiftCount.get(Number(a.id)) ?? 0
          const bMonthlyShifts = assignedShiftCount.get(Number(b.id)) ?? 0

          const aShiftsToday = results.filter(s => s.date === dateStr && Number(s.employeeId) === Number(a.id)).length
          const bShiftsToday = results.filter(s => s.date === dateStr && Number(s.employeeId) === Number(b.id)).length

          // 🌟 THE ELASTIC EFFICIENCY ALGORITHM 🌟
          // - Base score: Monthly shifts * 10
          // - Day Saver Bonus: -20 if already working 1 shift (pulls double shift)
          let scoreA = (aMonthlyShifts * 10) - (aShiftsToday === 1 ? 20 : 0)
          let scoreB = (bMonthlyShifts * 10) - (bShiftsToday === 1 ? 20 : 0)

          // - Elastic Penalty: Highly penalizes back-to-back double shifts
          if (aShiftsToday === 1) scoreA += getDoubleShiftProximityPenalty(a.id, dateStr, results)
          if (bShiftsToday === 1) scoreB += getDoubleShiftProximityPenalty(b.id, dateStr, results)

          const targetType = getShiftTypeConstant(t.categoryId)

          // Morning + Night Soft Penalty (+15 is enough to heavily favor Morning+Noon instead)
          if (targetType === 'night') {
            const aHasMorning = results.some(s => s.date === dateStr && Number(s.employeeId) === Number(a.id) && getShiftTypeConstant(s.categoryId) === 'morning')
            if (aHasMorning) scoreA += 15 

            const bHasMorning = results.some(s => s.date === dateStr && Number(s.employeeId) === Number(b.id) && getShiftTypeConstant(s.categoryId) === 'morning')
            if (bHasMorning) scoreB += 15 
          }

          if (scoreA !== scoreB) return scoreA - scoreB

          const aCatShifts = categoryShiftCount.get(`${Number(a.id)}-${Number(t.categoryId)}`) ?? 0
          const bCatShifts = categoryShiftCount.get(`${Number(b.id)}-${Number(t.categoryId)}`) ?? 0
          if (aCatShifts !== bCatShifts) return aCatShifts - bCatShifts

          return bObj.lotteryScore - aObj.lotteryScore
        })

        const chosen = eligibleWithTickets[0]?.emp ?? null
        if (chosen) {
          assignedShiftCount.set(Number(chosen.id), (assignedShiftCount.get(Number(chosen.id)) ?? 0) + 1)
          const catKey = `${Number(chosen.id)}-${Number(t.categoryId)}`
          categoryShiftCount.set(catKey, (categoryShiftCount.get(catKey) ?? 0) + 1)
        }

        results.push({ locationId: t.locationId, roleId: t.roleId, employeeId: chosen ? chosen.id : null, date: dateStr, categoryId: t.categoryId })
      }
    }

    for (const emp of employees) {
      const workedToday = results.some(r => {
        if (r.date !== dateStr || Number(r.employeeId) !== Number(emp.id)) return false
        const cat = categories.find(c => Number(c.id) === Number(r.categoryId))
        const isOff = cat?.type === 'off' || cat?.name === 'OFF (Lock)'
        const isVac = cat?.type === 'vacation' || cat?.name === 'ลาหยุด'
        return !isOff && !isVac
      })
      
      const isPreLockedToday = results.some(r => {
        if (r.date !== dateStr || Number(r.employeeId) !== Number(emp.id)) return false
        const cat = categories.find(c => Number(c.id) === Number(r.categoryId))
        const isOff = cat?.type === 'off' || cat?.name === 'OFF (Lock)'
        const isVac = cat?.type === 'vacation' || cat?.name === 'ลาหยุด'
        return isOff || isVac
      })

      if (!workedToday && !isPreLockedToday) {
        accumulatedOffDays.set(Number(emp.id), (accumulatedOffDays.get(Number(emp.id)) ?? 0) + 1)
      }
    }
  }

  return results
}