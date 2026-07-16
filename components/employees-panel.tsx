'use client'

import { useState, useTransition } from 'react'
import { Users, Plus, Trash2, Clock, UserPlus, ChevronDown, ChevronUp } from 'lucide-react'
import {
  createEmployee,
  deleteEmployee,
  addAvailability,
  deleteAvailability,
  updateEmployeeTitle,
  toggleEmployeeOverride,
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
import { toast } from 'sonner'
import { DAY_NAMES, DAY_SHORT, type Employee, type Role, type ShiftCategory } from '@/lib/types'
import { cn } from '@/lib/utils'

const nativeSelectClass = "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
const optionClass = "bg-background text-foreground"

export function EmployeesPanel({
  employees,
  roles,
  categories,
  titles,
}: {
  employees: Employee[]
  roles: Role[]
  categories: ShiftCategory[]
  titles: any[]
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [maxHours, setMaxHours] = useState('40')
  const [titleId, setTitleId] = useState('')
  const [isPending, startTransition] = useTransition()

  // 1. Strict Primary Key ID Sorting Loop (Keeps ordering constant)
  const sortedEmployees = [...employees].sort((a, b) => a.id - b.id)

  function submit() {
    if (!name.trim()) return
    startTransition(async () => {
      try {
        await createEmployee({
          name,
          email: email || undefined,
          maxHoursPerWeek: Number(maxHours) || 40,
          titleId: titleId ? Number(titleId) : null,
        })
        setName('')
        setEmail('')
        setMaxHours('40')
        setTitleId('')
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
            People who get assigned to shifts, their roles and availability.[cite: 6]
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button disabled={titles.length === 0}>
                <UserPlus className="size-4 mr-2" /> Add staff
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
                <Label htmlFor="emp-title">Rank / Title</Label>
                <select
                  id="emp-title"
                  className={nativeSelectClass}
                  value={titleId}
                  onChange={(e) => setTitleId(e.target.value)}
                >
                  <option value="" className={optionClass}>Select Rank (e.g. S1, S2, S3)...</option>[cite: 6]
                  {titles.map((t) => (
                    <option key={t.id} value={String(t.id)} className={optionClass}>
                      {t.name}
                    </option>
                  ))}
                </select>
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
        {titles.length === 0 && (
          <p className="mb-4 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Define some employee titles (S1, S2, S3) first before adding staff.[cite: 6]
          </p>
        )}
        {sortedEmployees.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No staff yet. Add your first team member.[cite: 6]
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {sortedEmployees.map((emp) => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                roles={roles}
                categories={categories}
                titles={titles}
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
  categories,
  titles,
  isPending,
  startTransition,
}: {
  employee: Employee
  roles: Role[]
  categories: ShiftCategory[]
  titles: any[]
  isPending: boolean
  startTransition: (cb: () => void) => void
}) {
  const [day, setDay] = useState('1')
  const [categoryId, setCategoryId] = useState(categories[0]?.id.toString() || '')
  
  // Collapse/Expand state for the card detail view
  const [isExpanded, setIsExpanded] = useState(false)

  function addSlot() {
    if (!categoryId) {
      toast.error('Please select a shift category')
      return
    }
    startTransition(async () => {
      await addAvailability({
        employeeId: employee.id,
        dayOfWeek: Number(day),
        categoryId: Number(categoryId),
        isMandatory: false,
      })
      toast.success('Custom availability override logged')
    })
  }

  const matchedTitleModel = titles.find(t => t.id === employee.titleId)

  return (
    <div className={cn(
      "rounded-lg border transition bg-background",
      isExpanded ? "shadow-sm border-muted-foreground/30" : "hover:border-border/80"
    )}>
      
      {/* Card Summary Header (Always Visible) */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between gap-4 p-4 cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-1 rounded-md bg-muted/50 text-muted-foreground transition">
            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </div>
          <div className="truncate">
            <p className="font-semibold text-base text-foreground truncate">{employee.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {employee.email ?? 'No email'} · max {employee.maxHoursPerWeek}h/wk
            </p>
          </div>
        </div>
        
        {/* Actions Dropdown Panel (Stops event bubbling from toggling expand/collapse) */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <select
            className={cn(nativeSelectClass, "w-36 h-8 text-xs bg-muted/40 px-2 py-0.5 shadow-none")}
            value={String(employee.titleId ?? '')}
            onChange={(e) => {
              const selectedVal = e.target.value
              startTransition(async () => {
                await updateEmployeeTitle(employee.id, selectedVal ? Number(selectedVal) : null)
                toast.success('Rank updated successfully')
              })
            }}
          >
            <option value="">No Title Assigned</option>
            {titles.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>

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
      </div>

      {/* Collapsible Detailed Configuration Submenu */}
      {isExpanded && (
        <div className="px-4 pb-4 animate-in fade-in duration-200">
          <Separator className="mb-3" />

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Qualified Roles & Custom Overrides
            </p>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Highlighted positions are active. Click any role to manually force an override exception.
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      await toggleEmployeeOverride(employee.id, role.id)
                      toast.success('Special exception toggled')
                    })
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition cursor-pointer',
                    employee.roleIds.includes(role.id)
                      ? 'border-primary bg-primary/10 text-foreground font-semibold'
                      : 'border-border text-muted-foreground bg-muted/20',
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
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Clock className="size-3.5" /> Availability & Operational Profile
            </p>
            
            {employee.availability.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded max-w-fit">
                  Active Exception List (Overrides Title Blueprint)
                </span>
                <div className="flex flex-wrap gap-2">
                  {employee.availability
                    .slice()
                    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                    .map((slot) => {
                      const cat = categories.find(c => c.id === slot.categoryId)
                      return (
                        <Badge
                          key={slot.id}
                          variant="default"
                          className="gap-1.5 pr-1 bg-primary text-primary-foreground border"
                        >
                          {DAY_SHORT[slot.dayOfWeek]} · {cat?.name ?? 'Unknown'}
                          <button
                            type="button"
                            onClick={() =>
                              startTransition(async () => {
                                await deleteAvailability(slot.id)
                              })
                            }
                            className="rounded-full p-0.5 hover:bg-background/20 cursor-pointer"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </Badge>
                      )
                    })}
                </div>
              </div>
            ) : typeof employee.titleId === 'number' && matchedTitleModel ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded max-w-fit">
                  Auto-Configured: Inherited from Rank blueprint [{matchedTitleModel.name}]
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    let targetActiveDays: number[] = [];
                    if (matchedTitleModel.workingTimePattern === 'official') targetActiveDays = [1, 2, 3, 4, 5];
                    else if (matchedTitleModel.workingTimePattern === 'shift') targetActiveDays = [0, 1, 2, 3, 4, 5, 6];
                    else if (matchedTitleModel.workingTimePattern === 'custom' && matchedTitleModel.customDays) {
                      targetActiveDays = String(matchedTitleModel.customDays).split(',').map(Number);
                    }
                    
                    if (targetActiveDays.length === 0) return <span className="text-xs text-muted-foreground italic">No automatic hours map configured.</span>;

                    return targetActiveDays.map(dIdx => (
                      <Badge key={dIdx} variant="outline" className="text-muted-foreground/80 bg-muted/20 border opacity-90 font-medium">
                        {DAY_SHORT[dIdx]} · Default Profile Shifts
                      </Badge>
                    ));
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No active title or override profile set — this person won&apos;t be auto-scheduled.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-3 mt-2 border-t pt-3 border-dashed">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Day</Label>
                <select
                  className={cn(nativeSelectClass, "w-32")}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={i} value={String(i)}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Shift Category</Label>
                <select
                  className={cn(nativeSelectClass, "w-40")}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="" disabled>Select custom shift...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={addSlot}
                disabled={isPending}
                className="h-9"
              >
                <Plus className="size-4 mr-1" /> Add Custom Exception
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}