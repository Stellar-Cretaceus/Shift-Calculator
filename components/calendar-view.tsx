'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Trash2,
  CalendarClock,
  AlertTriangle,
  Plus,
  Save,
  RotateCcw,
  X,
  Gift,
  LayoutGrid,
  TableProperties,
  BarChart3,
  HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { generateRange, clearRange, assignShift, createShift, deleteShift, commitBufferedShifts } from '@/app/actions/schedule'
import { createCategory } from '@/app/actions/data'
import { formatDate, shiftHours, getDatesInRange } from '@/lib/scheduler'
import {
  type Employee,
  type Location,
  type Role,
  type Shift,
  type ShiftCategory,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import * as XLSX from 'xlsx'

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView({
  startDate,
  endDate,
  shifts,
  roles,
  employees,
  locations,
  categories,
  hasTemplates,
  holidays = [],
}: {
  startDate: string
  endDate: string
  shifts: Shift[]
  roles: Role[]
  employees: Employee[]
  locations: Location[]
  categories: ShiftCategory[]
  hasTemplates: boolean
  holidays?: { id: number; date: string; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Layout View Mode Switch Track
  const [viewMode, setViewMode] = useState<'grid' | 'matrix'>('grid')

  // Month Picker State Derivation
  const initialDateObj = new Date(`${startDate}T00:00:00`)
  const [selectedYear, setSelectedYear] = useState(initialDateObj.getFullYear() || 2026)
  const [selectedMonth, setSelectedMonth] = useState(initialDateObj.getMonth() || 0)

  // Shared State Buffering Engine
  const [bufferedShifts, setBufferedShifts] = useState<Shift[]>([])
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
  setBufferedShifts(shifts)
  setDeletedShiftIds([]) // Reset deletions tracking
  setIsDirty(false)
}, [shifts])

  // Custom Modal View Control State
  const [activeModalDate, setActiveModalDate] = useState<string | null>(null)

  // Form states for adding custom shifts inside the day popup modal
  const [popupEmpId, setPopupEmpId] = useState('')
  const [popupRoleId, setPopupRoleId] = useState('')
  const [popupCatId, setPopupCatId] = useState('')
  const [popupLocId, setPopupLocId] = useState('')

  // NEW STATES: Integrated parameters to track the inline Shift Category Popup Builder
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatStart, setNewCatStart] = useState('08:00')
  const [newCatEnd, setNewCatEnd] = useState('16:00')
  const [newCatType, setNewCatType] = useState<'regular' | 'special' | 'vacation'>('regular')
  const [showHelp, setShowHelp] = useState(false)
  const [newCatAbbreviation, setNewCatAbbreviation] = useState('')
  const [newCatTimeOfDay, setNewCatTimeOfDay] = useState<'morning' | 'noon' | 'night' | 'none'>('morning')
  const [newCatColor, setNewCatColor] = useState('#2563eb')
  const [deletedShiftIds, setDeletedShiftIds] = useState<number[]>([])

  const roleById = (id: number | null) => id == null ? null : roles.find((r) => r.id === id)
  const empById = (id: number | null) => id == null ? null : employees.find((e) => e.id === id)
  const locById = (id: number) => locations.find((l) => l.id === id)
  const catById = (id: number) => categories.find((c) => c.id === id)

  const activeMonthDaysSequence = getDatesInRange(startDate, endDate)
  const openCount = bufferedShifts.filter((s) => s.employeeId === null).length
  const sortedEmployees = [...employees].sort((a, b) => a.id - b.id)

  function executeMonthViewChange(year: number, monthIdx: number) {
    const firstDay = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`
    const totalDaysInMonth = new Date(year, monthIdx + 1, 0).getDate()
    const lastDay = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(totalDaysInMonth).padStart(2, '0')}`
    router.push(`/?start=${firstDay}&end=${lastDay}`)
  }

  function closeModal() {
  setActiveModalDate(null)
  setPopupEmpId('')
  setPopupRoleId('')
  setPopupCatId('')
  setPopupLocId('')
  // Don't wipe deletedShiftIds here so changes persist if they reopen the modal before saving!
}

  function updateShiftAssignmentLocal(shiftId: number, empValue: string) {
    const targetEmpId = !empValue || empValue === 'open' ? null : Number(empValue)
    setBufferedShifts(prev => 
      prev.map(s => s.id === shiftId ? { ...s, employeeId: targetEmpId } : s)
    )
    setIsDirty(true)
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
          startTime: newCatType === 'vacation' ? '00:00' : newCatStart, 
          endTime: newCatType === 'vacation' ? '24:00' : newCatEnd,
          type: newCatType,
          abbreviation: newCatAbbreviation.trim(),
          timeOfDay: newCatTimeOfDay,
          color: newCatColor
        } as any)
        setNewCatAbbreviation('')
        setNewCatName('')
        setNewCatType('regular')
        setNewCatTimeOfDay('morning')
        setNewCatColor('#2563eb')
        setCatModalOpen(false)
        toast.success('New Shift Category integrated')
        router.refresh()
      } catch (e) {
        toast.error('Failed to add category')
      }
    })
  }

  function insertCustomShiftLocal() {
    if (!popupCatId || !activeModalDate) {
      toast.error('Please select a Shift Category first')
      return
    }

    const selectedCat = catById(Number(popupCatId))
    const shiftType = selectedCat?.type || 'regular'

    if (shiftType === 'vacation') {
      if (!popupEmpId) {
        toast.error('Vacation leaves must be assigned to a specific staff member')
        return
      }
    } else if (shiftType === 'regular') {
      // FIXED: Removed !popupRoleId enforcement. 
      // Now it only checks if a Location is selected.
      if (!popupLocId) {
        toast.error('Please select a Location for regular shifts')
        return
      }
    } 

    const newAdHocShift: Shift = {
      id: Math.floor(Math.random() * -1000000), 
      date: activeModalDate,
      
      // Pass null if the user didn't pick a role (Floating Shift)
      roleId: popupRoleId ? Number(popupRoleId) : null,
      categoryId: Number(popupCatId),
      
      // If locId is empty string, fall back to the first available location ID
      locationId: popupLocId ? Number(popupLocId) : (locations[0]?.id || 1),
      employeeId: popupEmpId ? Number(popupEmpId) : null,
    }

    setBufferedShifts(prev => [...prev, newAdHocShift])
    setIsDirty(true)
    toast.success(`Custom ${shiftType} shift added to buffer`)

    // Reset forms
    setPopupEmpId('')
    setPopupRoleId('')
    setPopupCatId('')
    setPopupLocId('')
  }


  function removeShiftLocal(shiftId: number) {
    setBufferedShifts(prev => prev.filter(s => s.id !== shiftId))
    
    // If it's a real database entry (positive ID), queue it up for backend deletion
    if (shiftId >= 0) {
      setDeletedShiftIds(prev => [...prev, shiftId])
    }
    
    setIsDirty(true)
    toast.success('Shift slot removed from layout buffer')
}

  function saveWorkspaceChanges() {
    startTransition(async () => {
      try {
        // A. Run deletions on database if any exist
        for (const id of deletedShiftIds) {
          await deleteShift(id)
        }

        // B. Perform single, super fast bulk replacement on the backend
        await commitBufferedShifts(startDate, endDate, bufferedShifts)

        toast.success('All scheduling modifications saved to database successfully')
        setDeletedShiftIds([])
        setIsDirty(false)
        router.refresh()
      } catch (e) {
        toast.error('Error committing workspace matrix')
      }
    })
  }

  function resetWorkspaceBuffer() {
  setBufferedShifts(shifts)
  setDeletedShiftIds([]) // Reset array
  setIsDirty(false)
  toast.info('Workspace reset to last saved database state')
}

  function generate() {
    startTransition(async () => {
      try {
        // 1. Grab the sandbox generation results
        const res = await generateRange(startDate, endDate, bufferedShifts)
        
        if (res && res.shifts) {
          // 2. 🌟 MAP GENERATED SHIFTS TO INCLUDE TEMPORARY NEGATIVE IDs
          const shiftsWithTempIds: Shift[] = res.shifts.map((s, index) => ({
            ...s,
            id: -(index + 1), // Assigns a unique negative ID for TS and React key safety
          }))

          // 3. Set the state with our newly typed Shift[] array
          setBufferedShifts(shiftsWithTempIds)
          setIsDirty(true)

          if (res.open > 0) {
            toast.warning(`Generated ${res.total} shifts — ${res.open} could not be filled in sandbox preview.`)
          } else {
            toast.success(`Generated ${res.total} shifts in sandbox draft mode!`)
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to generate')
      }
    })
  }

  function clear() {
    startTransition(async () => {
      await clearRange(startDate, endDate)
      router.refresh()
      toast.success('Cleared schedule for this range')
    })
  }

  function exportToExcel() {
    const headers = [
      'Staff Name', 
      ...activeMonthDaysSequence.map(d => new Date(`${d}T00:00:00`).getDate().toString()),
      'Natural OFF', // 🌟 Swapped order
      'Total OFF Days', // 🌟 Reverted to Total
      'OT Shifts',
      'Non-OT'
    ]

    const rows = sortedEmployees.map(employee => {
      const dayCells = activeMonthDaysSequence.map(dateStr => {
        const personalShifts = bufferedShifts.filter(s => s.employeeId === employee.id && s.date === dateStr)
        return personalShifts.map(s => catById(s.categoryId)?.abbreviation || s.roleId).join(', ') || '-'
      })

      let lockedOffCount = 0, naturalOffCount = 0, otCount = 0, regularCount = 0
      
      activeMonthDaysSequence.forEach(dateStr => {
        const dayShifts = bufferedShifts.filter(s => s.employeeId === employee.id && s.date === dateStr)
        const isHoliday = new Date(`${dateStr}T00:00:00`).getDay() === 0 || holidays.some(h => h.date === dateStr)
        
        const hasExplicitRest = dayShifts.some(s => {
          const t = catById(s.categoryId)?.type;
          return t === 'vacation' || t === 'off';
        });

        if (hasExplicitRest) {
          lockedOffCount++
        } else if (dayShifts.length === 0) {
          naturalOffCount++
        }

        dayShifts.forEach(s => {
          const t = catById(s.categoryId)?.type;
          if (t !== 'vacation' && t !== 'off') {
            if (isHoliday) otCount++; else regularCount++
          }
        })
      })

      // 🌟 Export columns matching the requested UI order: [..., Natural, Total, OT, Non-OT]
      const totalOffDays = lockedOffCount + naturalOffCount;
      return [employee.name, ...dayCells, naturalOffCount, totalOffDays, otCount, regularCount]
    })

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Duty Schedule')

    const fileName = `Schedule_${selectedYear}_${selectedMonth + 1}.xlsx`
    XLSX.writeFile(workbook, fileName)
    toast.success('Excel file generated and downloading!')
  }

  const totalDaysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay()
  const gridCells: { date: string; dayNum: number; isPadding: boolean; dayOfWeekIndex: number }[] = []

  if (firstDayOfWeek > 0) {
    const prevMonthLastDate = new Date(selectedYear, selectedMonth, 0).getDate()
    const prevMonthObj = new Date(selectedYear, selectedMonth - 1, 1)
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthLastDate - i
      const dStr = `${prevMonthObj.getFullYear()}-${String(prevMonthObj.getMonth() + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`
      gridCells.push({ date: dStr, dayNum: dNum, isPadding: true, dayOfWeekIndex: new Date(`${dStr}T00:00:00`).getDay() })
    }
  }
  for (let i = 1; i <= totalDaysInMonth; i++) {
    const dStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    gridCells.push({ date: dStr, dayNum: i, isPadding: false, dayOfWeekIndex: new Date(`${dStr}T00:00:00`).getDay() })
  }
  const remaining = 7 - (gridCells.length % 7)
  if (remaining < 7) {
    const nextMonthObj = new Date(selectedYear, selectedMonth + 1, 1)
    for (let i = 1; i <= remaining; i++) {
      const dStr = `${nextMonthObj.getFullYear()}-${String(nextMonthObj.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      gridCells.push({ date: dStr, dayNum: i, isPadding: true, dayOfWeekIndex: new Date(`${dStr}T00:00:00`).getDay() })
    }
  }

  const nativeSelectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full"
  const matchedModalHoliday = holidays.find(h => h.date === activeModalDate)

  // Pre-defined Tailwind colors mapping constants array
  const SHIFT_COLORS = [
    '#2563eb', // blue
    '#059669', // emerald
    '#d97706', // amber
    '#dc2626', // red
    '#0891b2', // cyan
    '#7c3aed', // violet
    '#db2777', // pink
    '#4b5563', // gray
  ] as const

  return (
    <div className="flex flex-col gap-4 relative">
      
      {/* Control Actions Configuration Topbar Menu */}
      <div className="flex flex-wrap items-end justify-between gap-3 bg-muted/30 p-4 rounded-xl border">
        <div className="flex flex-wrap items-end gap-3">
          
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Select Month</span>
            <select
              className={cn(nativeSelectClass, "w-40")}
              value={selectedMonth}
              onChange={(e) => {
                const nextMonth = Number(e.target.value)
                setSelectedMonth(nextMonth)
                executeMonthViewChange(selectedYear, nextMonth)
              }}
            >
              {Array.from({ length: 12 }).map((_, idx) => (
                <option key={idx} value={idx}>
                  {new Date(2026, idx, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Select Year</span>
            <select
              className={cn(nativeSelectClass, "w-28")}
              value={selectedYear}
              onChange={(e) => {
                const nextYear = Number(e.target.value)
                setSelectedYear(nextYear)
                executeMonthViewChange(nextYear, selectedMonth)
              }}
            >
              {[2025, 2026, 2027, 2028].map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center border rounded-lg bg-background p-0.5 h-9 ml-2 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn("px-3 h-full flex items-center gap-1.5 text-xs font-semibold rounded-md transition", viewMode === 'grid' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50")}
            >
              <LayoutGrid className="size-3.5" /> Calendar Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={cn("px-3 h-full flex items-center gap-1.5 text-xs font-semibold rounded-md transition", viewMode === 'matrix' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50")}
            >
              <TableProperties className="size-3.5" /> Spreadsheet Matrix
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <>
              <Button variant="outline" size="sm" onClick={resetWorkspaceBuffer} className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10">
                <RotateCcw className="size-4 mr-1.5" /> Reset Buffer
              </Button>
              <Button size="sm" onClick={saveWorkspaceChanges} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow">
                <Save className="size-4 mr-1.5" /> Save Changes
              </Button>
            </>
          )}
          {bufferedShifts.length > 0 && (
            <Button variant="outline" size="sm" onClick={clear} disabled={isPending}>
              <Trash2 className="size-4 mr-1.5" /> Clear Dates
            </Button>
          )}
          <Button size="sm" onClick={generate} disabled={isPending || !hasTemplates}>
            <Sparkles className="size-4 mr-1.5" /> Auto-generate
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportToExcel}
            className="h-9 border-emerald-600/30 hover:bg-emerald-600/10 text-emerald-500"
          >
            Download Excel (.xlsx)
          </Button>
        </div>
      </div>

      {isDirty && (
        <div className="text-xs bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-2 rounded-lg font-medium flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          Working layout contains unsaved shifts. Click "Save Changes" to store them.
        </div>
      )}

      {/* RENDERING TRACK A: Classic Standard Calendar Grid View Layout Mode */}
      {viewMode === 'grid' && (
        <>
          <div className="grid grid-cols-7 gap-3 mb-1 text-center hidden lg:grid">
            {CALENDAR_WEEKDAYS.map((day, idx) => (
              <span 
                key={day} 
                className={cn("text-xs font-bold uppercase tracking-wider", (idx === 0 || idx === 6) ? "text-red-400" : "text-muted-foreground")}
              >
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {gridCells.map((cell, index) => {
              const isToday = cell.date === formatDate(new Date())
              const isDbHoliday = holidays.some(h => h.date === cell.date)
              const isRedFrame = cell.dayOfWeekIndex === 0 || cell.dayOfWeekIndex === 6 || isDbHoliday

              const dayShifts = bufferedShifts
                .filter((s) => s.date === cell.date)
                .sort((a, b) => (catById(a.categoryId)?.startTime || '').localeCompare(catById(b.categoryId)?.startTime || ''))

              return (
                <Card
                  key={`${cell.date}-${index}`}
                  onClick={() => !cell.isPadding && setActiveModalDate(cell.date)}
                  className={cn(
                    'flex flex-col gap-2 p-2 min-h-36 transition bg-card border text-left',
                    cell.isPadding ? 'opacity-20 bg-muted/5 border-muted/20 pointer-events-none select-none' : 'cursor-pointer select-none hover:border-muted-foreground/40',
                    isToday && 'ring-2 ring-primary',
                    (!cell.isPadding && isRedFrame) ? 'border-red-500/50 shadow-sm shadow-red-500/5 bg-gradient-to-b from-red-500/[0.015] to-transparent' : 'border-border'
                  )}
                >
                  <div className="flex items-baseline justify-between px-1 pointer-events-none">
                    <span className={cn('text-[10px] font-bold uppercase lg:hidden', isRedFrame ? 'text-red-400' : 'text-muted-foreground')}>{CALENDAR_WEEKDAYS[cell.dayOfWeekIndex]}</span>
                    <span className="hidden lg:inline" />
                    <span className={cn('text-sm font-bold', isToday && 'text-primary', (!cell.isPadding && isRedFrame) && 'text-red-500')}>{cell.dayNum}</span>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-1 pointer-events-none">
                    {!cell.isPadding && dayShifts.length === 0 && (
                      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-muted/30 py-6">
                        <CalendarClock className="size-4 text-muted-foreground/20" />
                      </div>
                    )}
                    {!cell.isPadding && dayShifts.slice(0, 3).map((shift) => {
                      const role = roleById(shift.roleId)
                      const emp = empById(shift.employeeId)
                      const cat = catById(shift.categoryId)
                      return (
                        <div key={shift.id} className="text-[11px] px-2 py-1 rounded border-l-2 bg-muted/30 truncate flex items-center justify-between gap-1" style={{ borderLeftColor: cat?.color ?? '#4b5563' }}>
                          <span className="font-semibold text-foreground/90 truncate">{role?.name}:</span>
                          <span className={cn("truncate max-w-[60%] font-medium", !shift.employeeId && "text-destructive font-bold text-[10px]")}>{shift.employeeId ? emp?.name : 'Open'}</span>
                        </div>
                      )
                    })}
                    {!cell.isPadding && dayShifts.length > 3 && (
                      <div className="text-[10px] text-center font-bold text-muted-foreground bg-muted/40 rounded py-0.5 mt-auto">+ {dayShifts.length - 3} more entries</div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* RENDERING TRACK B: New Spreadsheet Matrix View Layout Mode */}
      {viewMode === 'matrix' && (
        <Card className="border rounded-xl overflow-hidden shadow-sm bg-card">
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-muted/40 border-b divide-x">
                  <th className="p-3 font-bold text-muted-foreground bg-background sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[150px]">
                    Staff Name / Date
                  </th>
                  {activeMonthDaysSequence.map((dateStr) => {
                    const dateObj = new Date(`${dateStr}T00:00:00`)
                    const isDbHoliday = holidays.some(h => h.date === dateStr)
                    const isWeekendOrHoliday = dateObj.getDay() === 0 || dateObj.getDay() === 6 || isDbHoliday

                    return (
                      <th
                        key={dateStr}
                        className={cn(
                          "p-2 text-center font-bold min-w-[42px] cursor-pointer hover:bg-muted/60 transition select-none",
                          isWeekendOrHoliday ? "text-red-500 bg-red-500/[0.02]" : "text-foreground"
                        )}
                        onClick={() => setActiveModalDate(dateStr)}
                      >
                        <div className="text-[10px] font-medium text-muted-foreground tracking-tight opacity-70">
                          {CALENDAR_WEEKDAYS[dateObj.getDay()]}
                        </div>
                        <div className="text-sm mt-0.5">{dateObj.getDate()}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody className="divide-y">
                {sortedEmployees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-muted/20 transition divide-x">
                    <td className="p-2.5 font-bold text-foreground bg-card sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center gap-2">
                      <div className="size-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span className="truncate">{employee.name}</span>
                    </td>

                    {activeMonthDaysSequence.map((dateStr) => {
                      const personalDayShifts = bufferedShifts.filter(
                        (s) => s.employeeId === employee.id && s.date === dateStr
                      )
                      const dateObj = new Date(`${dateStr}T00:00:00`)
                      const isDbHoliday = holidays.some(h => h.date === dateStr)
                      const isRedDay = dateObj.getDay() === 0 || dateObj.getDay() === 6 || isDbHoliday

                      return (
                        <td
                          key={dateStr}
                          onClick={() => {
                            setActiveModalDate(dateStr)
                            setPopupEmpId(String(employee.id))
                          }}
                          className={cn("p-1.5 text-center transition cursor-pointer relative h-11 select-none hover:bg-muted/40", isRedDay && "bg-red-500/[0.005]")}
                        >
                          {personalDayShifts.length > 0 ? (
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {personalDayShifts.map((shift) => {
                                const role = roleById(shift.roleId)
                                const cat = catById(shift.categoryId)
                                const abbreviationCode = cat?.abbreviation || cat?.name?.charAt(0) || '?'

                                return (
                                  <span
                                    key={shift.id}
                                    title={`${role?.name || 'Role'}: ${cat?.name || 'Shift'}`}
                                    className="px-1.5 py-0.5 text-[10px] font-black rounded text-white shadow-sm inline-block animate-in zoom-in-90 duration-100"
                                    style={{ backgroundColor: cat?.color ?? '#3b82f6' }}
                                  >
                                    {abbreviationCode}
                                  </span>
                                )
                              })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/10 font-light text-[10px]">-</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {openCount > 0 && (
                  <tr className="bg-destructive/[0.02] hover:bg-destructive/[0.04] divide-x border-t-2">
                    <td className="p-2.5 font-extrabold text-destructive bg-card sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center gap-2">
                      <div className="size-2 rounded-full bg-destructive animate-pulse shrink-0" />
                      <span>Open Slots / ตกหล่น</span>
                    </td>
                    {activeMonthDaysSequence.map((dateStr) => {
                      const unassignedDayShifts = bufferedShifts.filter(
                        (s) => s.employeeId === null && s.date === dateStr
                      )
                      return (
                        <td key={dateStr} onClick={() => setActiveModalDate(dateStr)} className="p-1.5 text-center cursor-pointer hover:bg-destructive/10">
                          {unassignedDayShifts.length > 0 ? (
                            <span className="bg-destructive/10 text-destructive border border-destructive/20 font-black px-1.5 py-0.5 rounded text-[10px]">
                              {unassignedDayShifts.length}
                            </span>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* NEW SECTION: Synced Operational Roster Summary Board */}
      <Card className="border rounded-xl overflow-hidden shadow-sm bg-card mt-2">
        <div className="p-4 border-b bg-muted/20 flex items-center gap-2 text-foreground font-bold">
          <BarChart3 className="size-4 text-primary" />
          <span>Monthly Duty Allocation Audit (สรุปเวรประจำเดือน)</span>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-muted/40 border-b divide-x text-muted-foreground font-bold">
                <th className="p-3 sticky left-0 bg-background z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[150px]">Staff Profile</th>
                {categories.map(cat => (
                  <th key={cat.id} className="p-2.5 text-center min-w-[70px] font-semibold">{cat.name}</th>
                ))}
                
                {/* 🌟 REORDERED & RENAMED: Natural OFF first, then Total OFF Days */}
                <th className="p-2.5 text-center bg-slate-500/5 text-slate-500 font-extrabold min-w-[75px]">Natural OFF</th>
                <th className="p-2.5 text-center bg-amber-500/5 text-amber-500 font-extrabold min-w-[70px]">Total OFF Days</th>
                
                <th className="p-2.5 text-center bg-red-500/5 text-red-500 font-extrabold min-w-[65px]">OT Shifts</th>
                <th className="p-2.5 text-center bg-primary/5 text-primary font-extrabold min-w-[75px]">Non-OT</th>
              </tr>
            </thead>
            <tbody className="divide-y font-medium text-foreground/90">
              {sortedEmployees.map((employee) => {
                const categoryCounters: Record<number, number> = {}
                categories.forEach(c => { categoryCounters[c.id] = 0 })

                let lockedOffDays = 0
                let naturalOffDays = 0
                let otShiftsAccumulator = 0
                let regularShiftsAccumulator = 0

                activeMonthDaysSequence.forEach((dateStr) => {
                  const dateObj = new Date(`${dateStr}T00:00:00`)
                  const isDbHoliday = holidays.some(h => h.date === dateStr)
                  const isHolidayDay = dateObj.getDay() === 0 || dateObj.getDay() === 6 || isDbHoliday

                  const dayShifts = bufferedShifts.filter(
                    (s) => s.employeeId === employee.id && s.date === dateStr
                  )

                  const hasExplicitRest = dayShifts.some(s => {
                    const t = catById(s.categoryId)?.type;
                    return t === 'vacation' || t === 'off';
                  });

                  if (hasExplicitRest) {
                    lockedOffDays++
                  } else if (dayShifts.length === 0) {
                    naturalOffDays++
                  }

                  dayShifts.forEach((shift) => {
                    const cat = catById(shift.categoryId)
                    if (cat) {
                      categoryCounters[cat.id]++
                      
                      if (cat.type !== 'vacation' && cat.type !== 'off') {
                        if (isHolidayDay) {
                          otShiftsAccumulator++
                        } else {
                          regularShiftsAccumulator++
                        }
                      }
                    }
                  })
                })

                // Calculate the true total OFF representation
                const totalOffDaysCombined = lockedOffDays + naturalOffDays;

                return (
                  <tr key={employee.id} className="hover:bg-muted/10 transition divide-x">
                    <td className="p-2.5 font-bold bg-card sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center gap-1.5">
                      <span className="text-foreground">{employee.name}</span>
                    </td>
                    
                    {categories.map((cat) => (
                      <td key={cat.id} className="p-2 text-center font-semibold">
                        {categoryCounters[cat.id] > 0 ? (
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[11px]",
                            (cat.type === 'vacation' || cat.type === 'off') ? "bg-amber-500/10 text-amber-500 font-bold" : "bg-muted/60 text-foreground"
                          )}>
                            {categoryCounters[cat.id]}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/20">-</span>
                        )}
                      </td>
                    ))}

                    <td className="p-2 text-center bg-slate-500/[0.015] font-bold text-slate-500 text-sm">
                      {naturalOffDays}
                    </td>
                    <td className="p-2 text-center bg-amber-500/[0.015] font-bold text-amber-500 text-sm">
                      {totalOffDaysCombined}
                    </td>
                    <td className="p-2 text-center bg-red-500/[0.015] font-bold text-red-500 text-sm">
                      {otShiftsAccumulator}
                    </td>
                    <td className="p-2 text-center bg-primary/[0.015] font-bold text-primary text-sm">
                      {regularShiftsAccumulator}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Individual Shift Day Overlay Popup Modal Component */}
      {activeModalDate && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-100">
          <Card className="w-full max-w-2xl shadow-xl border overflow-hidden max-h-[90vh] flex flex-col bg-card animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b flex items-center justify-between bg-muted/40">
              <div>
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  Manage Workspace Rules
                </h3>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">
                  Target Date Focus: {new Date(`${activeModalDate}T00:00:00`).toLocaleDateString('default', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {matchedModalHoliday && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-1 text-xs font-bold text-red-500 animate-in fade-in duration-200">
                    <Gift className="size-3.5" /> {matchedModalHoliday.name}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full size-8">
                <X className="size-4" />
              </Button>
            </div>

            <div className="p-4 overflow-y-auto flex flex-col gap-5 flex-1">
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Scheduled Workspace Slots</h4>
                {bufferedShifts.filter(s => s.date === activeModalDate).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg bg-muted/10">
                    No active shift constraints generated on this matrix coordinate yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                    {bufferedShifts
                      .filter(s => s.date === activeModalDate)
                      .map((shift) => {
                        const role = roleById(shift.roleId)
                        const category = catById(shift.categoryId)
                        const isVacationSlot = category?.type === 'vacation'
                        const options = employees
                          .filter((e) => 
                            isVacationSlot || 
                            shift.roleId === null || 
                            e.roleIds.includes(shift.roleId) || 
                            e.id === shift.employeeId
                          )
                          .sort((a, b) => a.id - b.id)

                        return (
                          <div key={shift.id} className="p-3 rounded-lg border bg-muted/20 flex flex-wrap items-center justify-between gap-3 text-sm" style={{ borderLeft: `4px solid ${role?.color ?? '#4b5563'}` }}>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-foreground">{role?.name ?? 'Any Position (Floating)'}</span>
                              <span className="text-xs text-muted-foreground font-medium">
                                {category?.name ?? 'Shift'} ({category?.startTime} - {category?.endTime}) · {locById(shift.locationId)?.name}
                              </span>
                            </div>
                            <select
                              className={cn(nativeSelectClass, "h-8 text-xs bg-background min-w-[160px] w-auto")}
                              value={shift.employeeId === null ? 'open' : String(shift.employeeId)}
                              onChange={(e) => updateShiftAssignmentLocal(shift.id, e.target.value)}
                            >
                              <option value="open">Unassigned / Open Slot</option>
                              {options.map((e) => (
                                <option key={e.id} value={String(e.id)}>{e.name}</option>
                              ))}
                            </select>

                            {/* NEW: Inline Layout Deletion Trigger Button */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeShiftLocal(shift.id)}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-md shrink-0 transition"
                              title="Remove this shift slot"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>

              <div className="border-t pt-4 flex flex-col gap-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Plus className="size-3.5" /> Inject Custom Shift Override
                </h4>
                
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center mb-0.5">
                      <label className="text-[11px] font-semibold text-muted-foreground">Shift Block (Category)</label>
                      
                      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
                        <DialogTrigger render={
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] text-primary p-0 hover:bg-transparent flex items-center">
                            <Plus className="size-3 mr-0.5"/> Add New Shift Type
                          </Button>
                        } />
                        <DialogContent className="max-w-md z-[60]">
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

                          <div className="flex flex-col gap-3 py-2 text-left">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-semibold text-muted-foreground">Shift Block Name</label>
                              <Input placeholder="e.g. เวรบ่าย, ลาพักผ่อน" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-semibold text-muted-foreground">Shorthand Abbreviation Code (ตัวย่อกะ)</label>
                              <Input 
                                placeholder="e.g. ช, บ, ด, ล" 
                                maxLength={3}
                                value={newCatAbbreviation} 
                                onChange={e => setNewCatAbbreviation(e.target.value)} 
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-semibold text-muted-foreground">Operational Type</label>
                              <select
                                className={cn(nativeSelectClass)}
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

                            {newCatType !== 'vacation' && (
                              <>
                                <div className="flex flex-col gap-1 mt-1 animate-in fade-in duration-200">
                                  <label className="text-xs font-semibold text-muted-foreground">Schedule Classification (ช่วงเวลาของกะสำหรับระบบคำนวณ)</label>
                                  <select
                                    className={cn(nativeSelectClass)}
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
                                    <label className="text-xs font-semibold text-muted-foreground">Start Time</label>
                                    <Input type="time" value={newCatStart} onChange={e => setNewCatStart(e.target.value)} />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted-foreground">End Time</label>
                                    <Input type="time" value={newCatEnd} onChange={e => setNewCatEnd(e.target.value)} />
                                  </div>
                                </div>
                              </>
                            )}

                            {/* FIXED: Placed the color palette matrix here smoothly! */}
                            <div className="flex flex-col gap-1 mt-1">
                              <label className="text-xs font-semibold text-muted-foreground">Select Shift Color Badge</label>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {SHIFT_COLORS.map((hexColor) => (
                                  <button
                                    key={hexColor}
                                    type="button"
                                    onClick={() => setNewCatColor(hexColor)}
                                    className={cn(
                                      "size-6 rounded-full border transition scale-90 hover:scale-100 shadow-sm",
                                      newCatColor === hexColor ? "ring-2 ring-primary border-white" : "border-transparent"
                                    )}
                                    style={{ backgroundColor: hexColor }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          <DialogFooter>
                            <Button onClick={handleAddCategoryInline} disabled={isPending}>Save Shift Type</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <select 
                      className={nativeSelectClass} 
                      value={popupCatId} 
                      onChange={(e) => {
                        setPopupCatId(e.target.value)
                        const cat = categories.find(c => c.id === Number(e.target.value))
                        if (cat?.type === 'vacation') {
                          setPopupRoleId('')
                          setPopupLocId('')
                        }
                      }}
                    >
                      <option value="">Select Block...</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.type === 'vacation' ? '(Vacation / Leave)' : `(${c.startTime}-${c.endTime})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {catById(Number(popupCatId))?.type !== 'vacation' ? (
                    <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">Shift Position (Role)</label>
                        <select className={nativeSelectClass} value={popupRoleId} onChange={(e) => setPopupRoleId(e.target.value)}>
                          <option value="">Leave Unassigned (Any Role / Floating)</option>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">Location Scope</label>
                        <select className={nativeSelectClass} value={popupLocId} onChange={(e) => setPopupLocId(e.target.value)}>
                          <option value="">
                            {catById(Number(popupCatId))?.type === 'special' ? 'Leave Unassigned (Optional)' : 'Select Location...'}
                          </option>
                          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Assign Employee {catById(Number(popupCatId))?.type === 'vacation' ? '(Required)' : '(Optional)'}
                    </label>
                    <select className={nativeSelectClass} value={popupEmpId} onChange={(e) => setPopupEmpId(e.target.value)}>
                      <option value="">{catById(Number(popupCatId))?.type === 'vacation' ? 'Select Employee...' : 'Leave Unassigned / Open Slot'}</option>
                      {sortedEmployees.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button type="button" onClick={insertCustomShiftLocal} size="sm" className="mt-2 self-start bg-primary text-primary-foreground">
                  <Plus className="size-4 mr-1.5" /> Append Custom Override
                </Button>
              </div>
            </div>

            <div className="p-3 border-t bg-muted/30 flex justify-end">
              <Button type="button" onClick={closeModal} variant="secondary" size="sm">Close Focus Window</Button>
            </div>
          </Card>
        </div>
      )}

    </div>
  )
}