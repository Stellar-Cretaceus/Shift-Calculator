import type { ShiftTemplate } from '@/lib/types'
import type { ShiftBlock } from '../types'

/**
 * Convert YYYY-MM-DD into JavaScript day-of-week.
 *
 * JS convention:
 * 0 = Sunday
 * 1 = Monday
 * ...
 * 6 = Saturday
 */
function getDayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00`).getDay()
}

/**
 * Build concrete shift blocks from recurring ShiftTemplates.
 *
 * Example:
 *
 * Template:
 * Monday / Morning / In Charge x2
 *
 * + date:
 * 2026-09-28 (Monday)
 *
 * becomes a real requirement for 2026-09-28.
 */
export function buildRequirements(
  templates: ShiftTemplate[],
  dates: string[],
): ShiftBlock[] {
  const blocks = new Map<string, ShiftBlock>()

  for (const date of dates) {
    const dayOfWeek = getDayOfWeek(date)

    /**
     * Only templates matching this weekday apply.
     */
    const matchingTemplates = templates.filter(
      template => template.dayOfWeek === dayOfWeek,
    )

    for (const template of matchingTemplates) {
      /**
       * Templates with the same:
       *
       * date + location + category
       *
       * belong to one shift block.
       */
      const key =
        `${date}:${template.locationId}:${template.categoryId}`

      let block = blocks.get(key)

      if (!block) {
        block = {
          date,
          locationId: template.locationId,
          categoryId: template.categoryId,
          requirements: [],
        }

        blocks.set(key, block)
      }

      /**
       * Usually each template row represents one role requirement.
       *
       * But we still check whether the role already exists,
       * just in case duplicate template rows exist.
       */
      const existingRole = block.requirements.find(
        requirement =>
          requirement.roleId === template.roleId,
      )

      if (existingRole) {
        existingRole.requiredCount += template.requiredCount
      } else {
        block.requirements.push({
          roleId: template.roleId,
          requiredCount: template.requiredCount,
        })
      }
    }
  }

  return Array.from(blocks.values())
}