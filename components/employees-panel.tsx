'use client'

import { useState, useTransition } from 'react'
import { Users, Plus, Trash2, Clock, UserPlus } from 'lucide-react'
import {
  createEmployee,
  deleteEmployee,
  addAvailability,
  deleteAvailability,
  updateEmployeeRoles,
} from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { DAY_NAMES, DAY_SHORT, type Employee, type Role } from '@/lib/types'
import { cn } from '@/lib/utils'

export function EmployeesPanel({
  employees,
  roles,
}: {
  employees: Employee[]
  roles: Role[]
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [maxHours, setMaxHours] = useState('40')
  const [roleIds, setRoleIds] = useState<number[]>([])
  const [isPending, startTransition] = useTransition()

  function toggleRole(id: number) {
    setRoleIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    )
  }

  function submit() {
    if (!name.trim()) return
    startTransition(async () => {
      try {
        await createEmployee({
          name,
          email: email || undefined,
          maxHoursPerWeek: Number(maxHours) || 40,
          roleIds,
        })
        setName('')
        setEmail('')
        setMaxHours('40')
        setRoleIds([])
        setOpen(false)
        toast.success('Staff member added')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to add')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="size-5 text-primary" /> Staff
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            People who get assigned to shifts, their roles and availability.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button disabled={roles.length === 0}>
                <UserPlus className="size-4" /> Add staff
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add staff member</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="emp-name">Name</Label>
                <Input
                  id="emp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="emp-email">Email (optional)</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="emp-hours">Max hours / week</Label>
                <Input
                  id="emp-hours"
                  type="number"
                  min={1}
                  max={168}
                  value={maxHours}
                  onChange={(e) => setMaxHours(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Qualified roles</Label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition',
                        roleIds.includes(role.id)
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                      {role.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={isPending || !name.trim()}>
                Add staff member
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {roles.length === 0 && (
          <p className="mb-4 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add at least one role first so you can assign it to staff.
          </p>
        )}
        {employees.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No staff yet. Add your first team member.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {employees.map((emp) => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                roles={roles}
                isPending={isPending}
                startTransition={startTransition}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmployeeCard({
  employee,
  roles,
  isPending,
  startTransition,
}: {
  employee: Employee
  roles: Role[]
  isPending: boolean
  startTransition: (cb: () => void) => void
}) {
  const [day, setDay] = useState('1')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')

  const roleById = (id: number) => roles.find((r) => r.id === id)

  function toggleRole(id: number) {
    const next = employee.roleIds.includes(id)
      ? employee.roleIds.filter((r) => r !== id)
      : [...employee.roleIds, id]
    startTransition(async () => {
      await updateEmployeeRoles(employee.id, next)
    })
  }

  function addSlot() {
    if (start >= end) {
      toast.error('End time must be after start time')
      return
    }
    startTransition(async () => {
      await addAvailability({
        employeeId: employee.id,
        dayOfWeek: Number(day),
        startTime: start,
        endTime: end,
      })
      toast.success('Availability added')
    })
  }

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{employee.name}</p>
          <p className="text-sm text-muted-foreground">
            {employee.email ?? 'No email'} · max {employee.maxHoursPerWeek}h/wk
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            startTransition(async () => {
              await deleteEmployee(employee.id)
              toast.success('Staff member removed')
            })
          }
          disabled={isPending}
          aria-label={`Delete ${employee.name}`}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      <Separator className="my-3" />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Roles
        </p>
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => toggleRole(role.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition',
                employee.roleIds.includes(role.id)
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground',
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: role.color }}
              />
              {role.name}
            </button>
          ))}
        </div>
      </div>

      <Separator className="my-3" />

      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Clock className="size-3.5" /> Availability
        </p>
        {employee.availability.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {employee.availability
              .slice()
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((slot) => (
                <Badge
                  key={slot.id}
                  variant="secondary"
                  className="gap-1.5 pr-1"
                >
                  {DAY_SHORT[slot.dayOfWeek]} {slot.startTime}–{slot.endTime}
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteAvailability(slot.id)
                      })
                    }
                    aria-label="Remove availability"
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No availability set — this person won&apos;t be auto-scheduled.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Day</Label>
            <Select value={day} onValueChange={(v) => setDay(v ?? '1')}>
              <SelectTrigger className="w-32">
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
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">To</Label>
            <Input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-28"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addSlot}
            disabled={isPending}
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>
    </div>
  )
}
