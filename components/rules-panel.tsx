'use client'

import { useState, useTransition } from 'react'
import { Settings2, Plus, Trash2 } from 'lucide-react'
import { createShiftTemplate, deleteShiftTemplate } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  DAY_SHORT,
  type Location,
  type Role,
  type ShiftTemplate,
  type ShiftCategory,
} from '@/lib/types'
import { shiftHours } from '@/lib/scheduler'
import { cn } from '@/lib/utils'

export function RulesPanel({
  templates,
  roles,
  locations,
  categories,
}: {
  templates: ShiftTemplate[]
  roles: Role[]
  locations: Location[]
  categories: ShiftCategory[]
}) {
  const [locationId, setLocationId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [count, setCount] = useState('1')
  const [isPending, startTransition] = useTransition()

  const canAdd = locations.length > 0 && roles.length > 0 && categories.length > 0

  function toggleDay(idx: number) {
    setSelectedDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
    )
  }

  function add() {
    if (!locationId || !roleId || !categoryId) {
      toast.error('Pick a location, role, and shift category')
      return
    }
    if (selectedDays.length === 0) {
      toast.error('Please select at least one target day')
      return
    }

    startTransition(async () => {
      try {
        await Promise.all(
          selectedDays.map((dayOfWeek) =>
            createShiftTemplate({
              locationId: Number(locationId),
              roleId: Number(roleId),
              dayOfWeek,
              categoryId: Number(categoryId),
              requiredCount: Number(count) || 1,
            })
          )
        )
        
        toast.success(`Successfully added ${selectedDays.length} shift rules`)
        setSelectedDays([])
        setLocationId('')
        setRoleId('')
        setCategoryId('')
        setCount('1')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to add rules')
      }
    })
  }

  const roleById = (id: number) => roles.find((r) => r.id === id)
  const locById = (id: number) => locations.find((l) => l.id === id)
  const catById = (id: number) => categories.find((c) => c.id === id)

  const nativeSelectClass = "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
  const optionClass = "bg-background text-foreground"

  // 1. Core Frontend Aggregation Pass
  const groupsMap: Record<string, {
    locationId: number
    roleId: number
    categoryId: number
    requiredCount: number
    days: number[]
    ids: number[]
  }> = {}

  templates.forEach((t) => {
    const key = `${t.locationId}-${t.roleId}-${t.categoryId}-${t.requiredCount}`
    if (!groupsMap[key]) {
      groupsMap[key] = {
        locationId: t.locationId,
        roleId: t.roleId,
        categoryId: t.categoryId,
        requiredCount: t.requiredCount,
        days: [],
        ids: [],
      }
    }
    groupsMap[key].days.push(t.dayOfWeek)
    groupsMap[key].ids.push(t.id)
  })

  // 2. Multi-tier Sorting Pass (Role -> Location -> Starting Time)
  const sortedRules = Object.values(groupsMap).sort((a, b) => {
    // Tier A: Sort Alphabetically by Position Name (supports Thai strings natively)
    const roleA = roleById(a.roleId)?.name || ''
    const roleB = roleById(b.roleId)?.name || ''
    const roleCompare = roleA.localeCompare(roleB, 'th')
    if (roleCompare !== 0) return roleCompare

    // Tier B: Sort Alphabetically by Department Location Name
    const locA = locById(a.locationId)?.name || ''
    const locB = locById(b.locationId)?.name || ''
    const locCompare = locA.localeCompare(locB, 'th')
    if (locCompare !== 0) return locCompare

    // Tier C: Sort Chronologically by Shift Category Starting Hour
    const timeA = catById(a.categoryId)?.startTime || ''
    const timeB = catById(b.categoryId)?.startTime || ''
    return timeA.localeCompare(timeB)
  })

  // 3. Section Bucket Builder Strategy Grouping
  const partitionedRulesByRole: Record<string, typeof sortedRules> = {}
  sortedRules.forEach((rule) => {
    const activeRoleName = roleById(rule.roleId)?.name || 'Unassigned Positions'
    if (!partitionedRulesByRole[activeRoleName]) {
      partitionedRulesByRole[activeRoleName] = []
    }
    partitionedRulesByRole[activeRoleName].push(rule)
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings2 className="size-5 text-primary" /> Shift Rules
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Recurring weekly staffing needs. The auto-scheduler fills these with
          available, qualified staff. e.g. &quot;Every Monday, 2 Cashiers for เวรเช้า at Downtown Store.&quot;
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canAdd && (
          <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add at least one location, role, and shift category before creating rules.
          </p>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 flex-1">
            
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Location</Label>
              <select
                className={nativeSelectClass}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="" disabled className={optionClass}>Select Location</option>
                {locations.map((l) => (
                  <option key={l.id} value={String(l.id)} className={optionClass}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Role</Label>
              <select
                className={nativeSelectClass}
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                <option value="" disabled className={optionClass}>Select Role</option>
                {roles.map((r) => (
                  <option key={r.id} value={String(r.id)} className={optionClass}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Shift Category</Label>
              <select
                className={nativeSelectClass}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="" disabled className={optionClass}>Select Shift</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)} className={optionClass}>
                    {c.name}
                  </option>
                ))}
              </select>
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

          <div className="flex flex-col gap-1 min-w-[280px]">
            <Label className="text-xs">Target Days</Label>
            <div className="flex items-center -space-x-px rounded-md overflow-hidden">
              {DAY_SHORT.map((dayStr, idx) => {
                const isSelected = selectedDays.includes(idx)
                return (
                  <button
                    key={dayStr}
                    type="button"
                    disabled={!canAdd}
                    onClick={() => toggleDay(idx)}
                    className={cn(
                      "flex-1 py-2 text-xs font-semibold border text-center transition cursor-pointer select-none",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary z-10"
                        : "bg-background text-muted-foreground border-input hover:bg-muted/50"
                    )}
                  >
                    {dayStr}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div>
          <Button onClick={add} disabled={isPending || !canAdd || selectedDays.length === 0}>
            <Plus className="size-4 mr-2" /> Add shift rules
          </Button>
        </div>

        {sortedRules.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No shift rules yet. Define your recurring staffing needs above.
          </p>
        ) : (
          <div className="flex flex-col gap-6 mt-2">
            {Object.entries(partitionedRulesByRole).map(([roleName, groupRules]) => {
              // Extract role color config for aesthetic divider lines
              const sampleRoleColor = roleById(groupRules[0]?.roleId)?.color ?? '#4b5563'
              
              return (
                <div key={roleName} className="flex flex-col gap-2">
                  
                  {/* Clean Visual Section Divider Block */}
                  <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: sampleRoleColor }} />
                      {roleName} Requirements
                    </span>
                    <div className="h-px bg-border flex-1 opacity-60" />
                  </div>

                  {/* Clean Group Container Box */}
                  <ul className="divide-y rounded-lg border bg-card/40 overflow-hidden">
                    {groupRules.map((group, groupIdx) => {
                      const role = roleById(group.roleId)
                      const cat = catById(group.categoryId)
                      
                      return (
                        <li
                          key={groupIdx}
                          className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 hover:bg-muted/10 transition"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <Badge
                              className="font-medium text-white"
                              style={{ backgroundColor: role?.color ?? '#4b5563' }}
                            >
                              {role?.name ?? 'Unknown role'}
                            </Badge>

                            <span className="text-sm text-muted-foreground">
                              at <strong className="text-foreground font-semibold">{locById(group.locationId)?.name ?? 'Unknown location'}</strong>
                            </span>

                            <Badge variant="outline" className="text-xs bg-muted/30">
                              {cat?.name ?? 'Unknown shift'}
                            </Badge>
                            
                            <span className="text-xs text-muted-foreground">
                              {cat?.startTime}–{cat?.endTime} ({cat ? shiftHours(cat.startTime, cat.endTime) : 0}h)
                            </span>

                            <div className="flex items-center -space-x-px rounded border bg-background overflow-hidden h-6">
                              {DAY_SHORT.map((dayStr, idx) => {
                                const isDayActive = group.days.includes(idx)
                                return (
                                  <span
                                    key={dayStr}
                                    className={cn(
                                      "px-2 text-[10px] font-bold border-r last:border-r-0 h-full flex items-center select-none",
                                      isDayActive
                                        ? "bg-primary text-primary-foreground font-extrabold"
                                        : "text-muted-foreground/30 bg-muted/10"
                                    )}
                                  >
                                    {dayStr}
                                  </span>
                                )
                              })}
                            </div>

                            <Badge variant="secondary" className="font-semibold">
                              {group.requiredCount} needed
                            </Badge>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              startTransition(async () => {
                                await Promise.all(group.ids.map((id) => deleteShiftTemplate(id)))
                                toast.success('Shift rule policy removed')
                              })
                        }
                        disabled={isPending}
                        aria-label="Delete rule group"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    )}
  </CardContent>
</Card>
)
}