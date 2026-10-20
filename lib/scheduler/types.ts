/**
 * How many people of a particular role are required
 * inside one shift block.
 *
 * Example:
 *   In Charge x2
 *   Member x2
 */
export type RoleRequirement = {
  roleId: number
  requiredCount: number
}

/**
 * A concrete shift that needs to be filled.
 *
 * Templates are recurring rules.
 * ShiftBlock is a real instance for a particular date.
 */
export type ShiftBlock = {
  date: string
  locationId: number
  categoryId: number

  requirements: RoleRequirement[]
}

/**
 * One employee already placed into a role inside a block.
 *
 * titleId is stored here because compatibility checks
 * care about the employee's title/rank.
 */
export type BlockAssignment = {
  employeeId: number
  titleId: number | null
  roleId: number
}

/**
 * ShiftBlockState represents:
 *
 * "What does this block look like RIGHT NOW?"
 *
 * The original requirements never change.
 * assignments tells us which slots have already been filled.
 */
export type ShiftBlockState = ShiftBlock & {
  assignments: BlockAssignment[]
}