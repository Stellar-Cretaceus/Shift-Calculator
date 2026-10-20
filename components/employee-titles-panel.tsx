'use client'

import { useState, useTransition, useEffect } from 'react'
import { Tags, Plus, Trash2, CalendarCheck, HelpCircle } from 'lucide-react'
import { createEmployeeTitle, deleteEmployeeTitle, createRole, createCategory } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { DAY_SHORT, type Role, type EmployeeTitle, type ShiftCategory } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  shiftHours,
} from '@/lib/scheduler/date/dates'

export function EmployeeTitlesPanel({
  titles,
  roles,
  categories,
}: {
  titles: EmployeeTitle[]
  roles: Role[]
  categories: ShiftCategory[]
}) {
  const [isPending, startTransition] = useTransition()
  
  // Title Blueprint Form State
  const [name, setName] = useState('')
  const [pattern, setPattern] = useState<'official' | 'shift' | 'custom'>('shift')
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [restOnHoliday, setRestOnHoliday] = useState(false)
  const [mustWorkAll, setMustWorkAll] = useState(false)
  const [allowedRoleIds, setAllowedRoleIds] = useState<number[]>([])
  const [allowedCategoryIds, setAllowedCategoryIds] = useState<number[]>([])
  
  // Track selected coworker Title IDs (Default to true/all titles checked!)
  const [compatibleTitleIds, setCompatibleTitleIds] = useState<number[]>([])

  // Sync defaults whenever the existing titles list updates
  useEffect(() => {
    setCompatibleTitleIds(titles.map(t => t.id))
  }, [titles])

  // Inline Modals State
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatStart, setNewCatStart] = useState('08:00')
  const [newCatEnd, setNewCatEnd] = useState('16:00')
  const [newCatType, setNewCatType] = useState<'regular' | 'special' | 'vacation'>('regular')
  const [showHelp, setShowHelp] = useState(false)
  const [newCatAbbreviation, setNewCatAbbreviation] = useState('')
  
  // Defensively match the correct starting form defaults we established
  const [newCatTimeOfDay, setNewCatTimeOfDay] = useState<'morning' | 'noon' | 'night' | 'none'>('morning')

  function handlePresetSelect(type: 'official' | 'shift') {
    setPattern(type)
    if (type === 'official') {
      setCustomDays([1, 2, 3, 4, 5])
      setRestOnHoliday(true)
      setMustWorkAll(true)
    } else {
      setCustomDays([0, 1, 2, 3, 4, 5, 6])
      setRestOnHoliday(false)
      setMustWorkAll(false)
    }
  }

  function toggleCustomDay(dayIndex: number) {
    setCustomDays(prev =>
      prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex]
    )
  }

  function handleAddRoleInline() {
    if (!newRoleName.trim()) return
    startTransition(async () => {
      try {
        await createRole(newRoleName.trim(), '#4b5563')
        setNewRoleName('')
        setRoleModalOpen(false)
        toast.success('New Position created')
      } catch (e) {
        toast.error('Failed to create position')
      }
    })
  }

  function handleAddCategoryInline() {
  if (!newCatName.trim()) return
  if (newCatType !== 'vacation' && newCatStart === newCatEnd) {
    toast.error('Start and end time cannot be exactly identical')
    return
  }
  startTransition(async () => {
    try {
      await createCategory({ 
        name: newCatName.trim(), 
        // Enforces absolute full-day bounds if the category type is a vacation leave
        startTime: newCatType === 'vacation' ? '00:00' : newCatStart, 
        endTime: newCatType === 'vacation' ? '24:00' : newCatEnd,
        type: newCatType,
        abbreviation: newCatAbbreviation.trim(),
        timeOfDay: newCatTimeOfDay
      } as any)
      setNewCatAbbreviation('')
      setNewCatName('')
      setNewCatType('regular')
      setNewCatTimeOfDay('morning')
      setCatModalOpen(false)
      toast.success('New Shift Category integrated')
    } catch (e) {
      toast.error('Failed to add category')
    }
  })
}

  function submitTitle() {
    if (!name.trim()) return
    startTransition(async () => {
      try {
        await createEmployeeTitle({
          name: name.trim(),
          workingTimePattern: pattern,
          customDays: customDays.join(','),
          restOnHoliday,
          mustWorkAllAvailable: mustWorkAll,
          allowedRoleIds,
          compatibleTitleIds,
          allowedCategoryIds,
          allowedLocationIds: [],
        })
        setName('')
        setAllowedRoleIds([])
        setAllowedCategoryIds([])
        setCompatibleTitleIds(titles.map(t => t.id))
        toast.success('Employee Title blueprint configured')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error creating configuration blueprint')
      }
    })
  }

  const nativeSelectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  const regularCategories = categories.filter(c => c.type === 'regular' || !c.type)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tags className="size-5 text-primary" /> Setup Employee Title (Rank)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title-name">Title Name</Label>
            <Input id="title-name" placeholder="e.g. S1, S2, S3" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Box 1. Define Working Times */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Define Working Times</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={pattern === 'official' ? 'default' : 'outline'} onClick={() => handlePresetSelect('official')}>
                ทำงานตามเวลาราชการ (Mon-Fri)
              </Button>
              <Button type="button" size="sm" variant={pattern === 'shift' ? 'default' : 'outline'} onClick={() => handlePresetSelect('shift')}>
                ทำงานเป็นกะ (Sun-Sat)
              </Button>
              <Button type="button" size="sm" variant={pattern === 'custom' ? 'default' : 'outline'} onClick={() => setPattern('custom')}>
                Custom Config
              </Button>
            </div>

            {pattern === 'custom' && (
              <div className="flex flex-col gap-2 mt-1 animate-in fade-in-50 duration-200">
                <Label className="text-xs text-muted-foreground">Choose Available Days</Label>
                <div className="flex gap-1">
                  {DAY_SHORT.map((day, idx) => (
                    <button
                      key={day} type="button"
                      onClick={() => toggleCustomDay(idx)}
                      className={cn("size-8 text-xs font-semibold rounded border transition", customDays.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground")}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" id="holiday-rest" className="size-4 rounded accent-primary cursor-pointer"
                  checked={restOnHoliday} onChange={(e) => setRestOnHoliday(e.target.checked)} disabled={pattern !== 'custom'} 
                />
                <Label htmlFor="holiday-rest" className="text-sm cursor-pointer select-none">Can rest on official holidays</Label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" id="must-work" className="size-4 rounded accent-primary cursor-pointer"
                  checked={mustWorkAll} onChange={(e) => setMustWorkAll(e.target.checked)} disabled={pattern !== 'custom'} 
                />
                <Label htmlFor="must-work" className="text-sm cursor-pointer select-none">Must be scheduled on all chosen available days</Label>
              </div>
            </div>
          </div>

          {/* Box 2. Define Which Shift Role */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="flex justify-between items-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Allowed Positions (Shift Roles)</p>
              <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
                <DialogTrigger render={<Button variant="ghost" size="sm" className="h-6 text-xs text-primary"><Plus className="size-3 mr-1"/> Add New Position</Button>} />
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Missing System Position</DialogTitle></DialogHeader>
                  <Input placeholder="e.g. Leader, Member, Trainee" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} />
                  <DialogFooter><Button onClick={handleAddRoleInline} disabled={isPending}>Confirm and Sync</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex flex-wrap gap-2">
              {roles.map(r => (
                <button
                  key={r.id} type="button"
                  onClick={() => setAllowedRoleIds(prev => prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id])}
                  className={cn("text-xs border px-3 py-1 rounded-full transition", allowedRoleIds.includes(r.id) ? "bg-foreground text-background border-foreground font-medium" : "bg-background text-muted-foreground")}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          {/* Box 3. Allowed Shift Categories */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="flex justify-between items-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Allowed Shift Blocks (Categories)</p>
              <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
                <DialogTrigger render={<Button variant="ghost" size="sm" className="h-6 text-xs text-primary"><Plus className="size-3 mr-1"/> Add New Shift Type</Button>} />
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <div className="flex items-center justify-between pr-4">
                      <DialogTitle>Configure Custom Shift Type</DialogTitle>
                      <button 
                        type="button" 
                        onClick={() => setShowHelp(!showHelp)}
                        className="text-muted-foreground hover:text-primary transition"
                        title="Show shift definitions help"
                      >
                        <HelpCircle className="size-4" />
                      </button>
                    </div>
                  </DialogHeader>

                  {showHelp && (
                    <div className="text-[11px] bg-muted p-2.5 rounded-lg border flex flex-col gap-1 text-muted-foreground animate-in fade-in duration-150">
                      <p>• <strong className="text-foreground">Regular:</strong> Shifts filled automatically by scheduler rules (e.g. เช้า, บ่าย, ดึก).</p>
                      <p>• <strong className="text-foreground">Special:</strong> One-off ad-hoc events assigned manually only (e.g. อบรม, ประชุม).</p>
                      <p>• <strong className="text-foreground">Vacation / Leave:</strong> Marks employee completely unavailable (e.g. ลาป่วย, ลาพักผ่อน).</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 py-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Shift Block Name</Label>
                      <Input placeholder="e.g. เวรบ่าย, ลาพักผ่อน" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Shorthand Abbreviation Code (ตัวย่อกะ)</Label>
                      <Input 
                        placeholder="e.g. ช, บ, ด, ล" 
                        maxLength={3}
                        value={newCatAbbreviation} 
                        onChange={e => setNewCatAbbreviation(e.target.value)} 
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Operational Type</Label>
                      <select
                        className={nativeSelectClass}
                        value={newCatType}
                        onChange={(e) => {
                          const nextType = e.target.value as 'regular' | 'special' | 'vacation'
                          setNewCatType(nextType)
                          if (nextType === 'regular') {
                            setNewCatTimeOfDay('morning')
                          } else {
                            setNewCatTimeOfDay('none')
                          }
                        }}
                      >
                        <option value="regular">Regular Shift (Auto-scheduled)</option>
                        <option value="special">Special Shift (Manual Assign Only)</option>
                        <option value="vacation">Vacation / Leave (Manual Assign Block)</option>
                      </select>
                    </div>

                    {/* FIXED: Form parameters wrap to toggle options cleanly based on shift context */}
                    {newCatType !== 'vacation' && (
                      <>
                        <div className="flex flex-col gap-1 mt-1 animate-in fade-in duration-200">
                          <Label className="text-xs">Schedule Classification (ช่วงเวลาของกะสำหรับระบบคำนวณ)</Label>
                          <select
                            className={nativeSelectClass}
                            value={newCatTimeOfDay}
                            onChange={(e) => setNewCatTimeOfDay(e.target.value as any)}
                          >
                            {newCatType === 'special' && (
                              <option value="none">Standard / Unrestricted (ทั่วไป ไม่ติดเงื่อนไขพิเศษ)</option>
                            )}
                            <option value="morning">Morning Shift Block (เวรเช้า)</option>
                            <option value="noon">Noon Shift Block (เวรบ่าย)</option>
                            <option value="night">Night Shift Block (เวรดึก)</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-1 duration-150">
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs">Start Time</Label>
                            <Input type="time" value={newCatStart} onChange={e => setNewCatStart(e.target.value)} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs">End Time</Label>
                            <Input type="time" value={newCatEnd} onChange={e => setNewCatEnd(e.target.value)} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddCategoryInline} disabled={isPending}>Save Shift Type</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {regularCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-background py-3 border border-dashed rounded text-center">
                No active auto-schedulable categories created yet. Click above to add.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {regularCategories.map(c => (
                  <button
                    key={c.id} type="button"
                    onClick={() => setAllowedCategoryIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                    className={cn(
                      "flex justify-between items-center border p-2.5 rounded-lg text-xs w-full transition text-left gap-4",
                      allowedCategoryIds.includes(c.id) ? "bg-primary/10 border-primary text-foreground font-medium" : "bg-background text-muted-foreground border-border"
                    )}
                  >
                    {/* ENHANCEMENT: Displaying clean scheduling category classification badges inline */}
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-foreground text-sm">{c.name}</span>
                      {c.timeOfDay && c.timeOfDay !== 'none' && (
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded w-max tracking-wide uppercase",
                          c.timeOfDay === 'morning' && "text-sky-600 bg-sky-500/10 dark:text-sky-400",
                          c.timeOfDay === 'noon' && "text-amber-600 bg-amber-500/10 dark:text-amber-400",
                          c.timeOfDay === 'night' && "text-indigo-600 bg-indigo-500/10 dark:text-indigo-400"
                        )}>
                          {c.timeOfDay === 'morning' && 'เวรเช้า (Morning)'}
                          {c.timeOfDay === 'noon' && 'เวรบ่าย (Noon)'}
                          {c.timeOfDay === 'night' && 'เวรดึก (Night)'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] opacity-80 text-muted-foreground whitespace-nowrap bg-muted px-2 py-1 rounded border">
                      {c.startTime} – {c.endTime} ({shiftHours(c.startTime, c.endTime)}h)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Box 4. Shift Compatibility Matrix */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 animate-in slide-in-from-bottom-2 duration-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              4. Shift Compatibility Matrix (Can Be Scheduled With)
            </p>
            
            {titles.length === 0 ? (
              <p className="text-xs text-muted-foreground italic bg-background/50 p-3 rounded border border-dashed border-border text-center">
                No other titles configured yet. Once you save your first title, they will appear here to configure co-worker compatibility rules!
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {titles.map(t => (
                  <div key={t.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`compat-${t.id}`}
                      className="size-4 rounded accent-primary cursor-pointer"
                      checked={compatibleTitleIds.includes(t.id)}
                      onChange={(e) => {
                        const isChecked = e.target.checked
                        setCompatibleTitleIds(prev => isChecked ? [...prev, t.id] : prev.filter(id => id !== t.id))
                      }}
                    />
                    <Label htmlFor={`compat-${t.id}`} className="text-sm cursor-pointer select-none">{t.name}</Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button className="w-full mt-2" onClick={submitTitle} disabled={isPending || !name.trim()}>
            <Plus className="size-4 mr-2" /> Save Title Blueprint
          </Button>
        </CardContent>
      </Card>

      {/* Index Sidebar Preview */}
      <div>
        <Card>
          <CardHeader><CardTitle className="text-lg">Configured Blueprints</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {titles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">No rank models configured yet.</p>
            ) : (
              titles.map(t => {
                const compatibleNames = titles
                  .filter(other => {
                    if (other.id === t.id) return false
                    const tHasRecords = t.compatibleTitleIds.length > 0
                    const otherHasRecords = other.compatibleTitleIds.length > 0
                    if (tHasRecords && t.compatibleTitleIds.includes(other.id)) return true
                    if (otherHasRecords && other.compatibleTitleIds.includes(t.id)) return true
                    if (!tHasRecords || !otherHasRecords) return true
                    return false
                  })
                  .map(other => other.name)

                return (
                  <div key={t.id} className="p-3 border rounded-lg bg-card flex flex-col gap-2 relative group">
                    <div className="flex justify-between items-start pr-8">
                      <div>
                        <p className="font-bold text-base text-primary">{t.name}</p>
                        <Badge variant="secondary" className="capitalize text-[10px] h-4 mt-0.5">
                          Pattern: {t.workingTimePattern}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="size-7 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition"
                        onClick={() => startTransition(async () => { await deleteEmployeeTitle(t.id); toast.success('Rank removed') })}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                    
                    <div className="text-xs text-muted-foreground flex flex-col gap-1.5 bg-muted/40 p-2 rounded">
                      <p className="flex items-center gap-1 font-medium"><CalendarCheck className="size-3"/> Holidays: {t.restOnHoliday ? 'Rest' : 'Eligible'}</p>
                      <p>• <strong>Positions:</strong> {t.allowedRoleIds.map(id => roles.find(r => r.id === id)?.name).join(', ') || 'None'}</p>
                      
                      {/* ENHANCEMENT: Appending descriptive Thai text tags onto sidebar summary items mapping */}
                      <p>• <strong>Shifts Allowed:</strong> {
                        t.allowedCategoryIds.map(id => {
                          const cat = categories.find(c => c.id === id)
                          if (!cat) return 'Unknown'
                          const classificationSuffix = cat.timeOfDay && cat.timeOfDay !== 'none'
                            ? ` (${cat.timeOfDay === 'morning' ? 'เช้า' : cat.timeOfDay === 'noon' ? 'บ่าย' : 'ดึก'})`
                            : ''
                          return `${cat.name}${classificationSuffix}`
                        }).join(', ') || 'None'
                      }</p>
                      <p>• <strong>Compatible Coworkers:</strong> {compatibleNames.join(', ') || 'Standalone Only'}</p>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}