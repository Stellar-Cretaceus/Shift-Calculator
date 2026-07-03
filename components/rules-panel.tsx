'use client'

import { useState, useTransition } from 'react'
import { Settings2, Plus, Trash2 } from 'lucide-react'
import { createShiftTemplate, deleteShiftTemplate } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  DAY_NAMES,
  type Location,
  type Role,
  type ShiftTemplate,
} from '@/lib/types'
import { shiftHours } from '@/lib/scheduler'

export function RulesPanel({
  templates,
  roles,
  locations,
}: {
  templates: ShiftTemplate[]
  roles: Role[]
  locations: Location[]
}) {
  const [locationId, setLocationId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [day, setDay] = useState('1')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')
  const [count, setCount] = useState('1')
  const [isPending, startTransition] = useTransition()

  const canAdd = locations.length > 0 && roles.length > 0

  function add() {
    if (!locationId || !roleId) {
      toast.error('Pick a location and a role')
      return
    }
    if (start >= end) {
      toast.error('End time must be after start time')
      return
    }
    startTransition(async () => {
      try {
        await createShiftTemplate({
          locationId: Number(locationId),
          roleId: Number(roleId),
          dayOfWeek: Number(day),
          startTime: start,
          endTime: end,
          requiredCount: Number(count) || 1,
        })
        toast.success('Shift rule added')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to add rule')
      }
    })
  }

  const roleById = (id: number) => roles.find((r) => r.id === id)
  const locById = (id: number) => locations.find((l) => l.id === id)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings2 className="size-5 text-primary" /> Shift Rules
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Recurring weekly staffing needs. The auto-scheduler fills these with
          available, qualified staff. e.g. &quot;Every Monday, 2 Cashiers from
          09:00 to 17:00 at Downtown Store.&quot;
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canAdd && (
          <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add at least one location and one role before creating shift rules.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Location</Label>
            <Select
              value={locationId}
              onValueChange={(v) => setLocationId(v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Role</Label>
            <Select value={roleId} onValueChange={(v) => setRoleId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Day</Label>
            <Select value={day} onValueChange={(v) => setDay(v ?? '1')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">From</Label>
            <Input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">To</Label>
            <Input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Staff needed</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Button onClick={add} disabled={isPending || !canAdd}>
            <Plus className="size-4" /> Add shift rule
          </Button>
        </div>

        {templates.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No shift rules yet. Define your recurring staffing needs above.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {templates.map((t) => {
              const role = roleById(t.roleId)
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className="font-medium text-white"
                      style={{ backgroundColor: role?.color ?? '#4b5563' }}
                    >
                      {role?.name ?? 'Unknown role'}
                    </Badge>
                    <span className="text-sm font-medium">
                      {DAY_NAMES[t.dayOfWeek]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t.startTime}–{t.endTime} (
                      {shiftHours(t.startTime, t.endTime)}h)
                    </span>
                    <span className="text-sm text-muted-foreground">
                      · {locById(t.locationId)?.name ?? 'Unknown location'}
                    </span>
                    <Badge variant="secondary">
                      {t.requiredCount} needed
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteShiftTemplate(t.id)
                        toast.success('Rule removed')
                      })
                    }
                    disabled={isPending}
                    aria-label="Delete rule"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
