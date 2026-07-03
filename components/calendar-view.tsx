'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trash2,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { generateWeek, clearWeek, assignShift } from '@/app/actions/schedule'
import { formatDate, shiftHours } from '@/lib/scheduler'
import {
  DAY_SHORT,
  type Employee,
  type Location,
  type Role,
  type Shift,
} from '@/lib/types'
import { cn } from '@/lib/utils'

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

function prettyRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
}

export function CalendarView({
  weekStart,
  shifts,
  roles,
  employees,
  locations,
  hasTemplates,
}: {
  weekStart: string
  shifts: Shift[]
  roles: Role[]
  employees: Employee[]
  locations: Location[]
  hasTemplates: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const roleById = (id: number) => roles.find((r) => r.id === id)
  const empById = (id: number | null) =>
    id == null ? null : employees.find((e) => e.id === id)
  const locById = (id: number) => locations.find((l) => l.id === id)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const openCount = shifts.filter((s) => s.employeeId === null).length

  function goTo(newWeek: string) {
    router.push(`/?week=${newWeek}`)
  }

  function generate() {
    startTransition(async () => {
      try {
        const res = await generateWeek(weekStart)
        router.refresh()
        if (res.open > 0) {
          toast.warning(
            `Generated ${res.total} shifts — ${res.open} could not be filled.`,
          )
        } else {
          toast.success(`Generated ${res.total} shifts, all filled.`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to generate')
      }
    })
  }

  function clear() {
    startTransition(async () => {
      await clearWeek(weekStart)
      router.refresh()
      toast.success('Cleared this week')
    })
  }

  function reassign(shiftId: number, value: string | null) {
    const employeeId = !value || value === 'open' ? null : Number(value)
    startTransition(async () => {
      await assignShift(shiftId, employeeId)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => goTo(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-44 text-center">
            <p className="text-sm font-semibold">{prettyRange(weekStart)}</p>
            <p className="text-xs text-muted-foreground">
              {shifts.length} shifts
              {openCount > 0 ? ` · ${openCount} open` : ''}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => goTo(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goTo(formatDate(weekStartToday()))}
          >
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {shifts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clear}
              disabled={isPending}
            >
              <Trash2 className="size-4" /> Clear
            </Button>
          )}
          <Button onClick={generate} disabled={isPending || !hasTemplates}>
            <Sparkles className="size-4" /> Auto-generate
          </Button>
        </div>
      </div>

      {!hasTemplates && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          Define some shift rules in the &quot;Shift Rules&quot; tab, then come
          back to auto-generate a schedule.
        </p>
      )}

      {/* Calendar grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((date, i) => {
          const dayShifts = shifts
            .filter((s) => s.date === date)
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
          const dayNum = new Date(`${date}T00:00:00`).getDate()
          const isToday = date === formatDate(new Date())

          return (
            <Card
              key={date}
              className={cn(
                'flex flex-col gap-2 p-2',
                isToday && 'ring-2 ring-primary',
              )}
            >
              <div className="flex items-baseline justify-between px-1">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  {DAY_SHORT[i]}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold',
                    isToday && 'text-primary',
                  )}
                >
                  {dayNum}
                </span>
              </div>

              <div className="flex min-h-16 flex-col gap-2">
                {dayShifts.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-md border border-dashed py-4">
                    <CalendarClock className="size-4 text-muted-foreground/50" />
                  </div>
                ) : (
                  dayShifts.map((shift) => {
                    const role = roleById(shift.roleId)
                    const emp = empById(shift.employeeId)
                    const open = shift.employeeId === null
                    // Only staff qualified for the role are offered.
                    const options = employees.filter((e) =>
                      e.roleIds.includes(shift.roleId),
                    )
                    return (
                      <div
                        key={shift.id}
                        className={cn(
                          'overflow-hidden rounded-md border-l-4 bg-card p-2 shadow-sm',
                          open && 'border-dashed',
                        )}
                        style={{ borderLeftColor: role?.color ?? '#4b5563' }}
                      >
                        <p className="text-xs font-semibold leading-tight">
                          {role?.name ?? 'Role'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {shift.startTime}–{shift.endTime} ·{' '}
                          {shiftHours(shift.startTime, shift.endTime)}h
                        </p>
                        <p className="mb-1 truncate text-[11px] text-muted-foreground">
                          {locById(shift.locationId)?.name}
                        </p>
                        <Select
                          value={open ? 'open' : String(shift.employeeId)}
                          onValueChange={(v) => reassign(shift.id, v)}
                        >
                          <SelectTrigger
                            className={cn(
                              'h-7 text-xs',
                              open &&
                                'border-destructive/50 text-destructive',
                            )}
                          >
                            <SelectValue>
                              {open ? 'Unassigned' : (emp?.name ?? 'Unknown')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Unassigned</SelectItem>
                            {options.map((e) => (
                              <SelectItem key={e.id} value={String(e.id)}>
                                {e.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Legend */}
      {roles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <span className="text-xs font-medium text-muted-foreground">
            Roles:
          </span>
          {roles.map((r) => (
            <span key={r.id} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              {r.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Sunday of the current week (local). */
function weekStartToday(): Date {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}
