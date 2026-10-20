'use client'

import { useState, useTransition } from 'react'
import { Clock, Plus, Trash2 } from 'lucide-react'
// We will need to create these actions in your data.ts file next!
import { createCategory, deleteCategory } from '@/app/actions/data' 
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  shiftHours,
} from '@/lib/scheduler/date/dates'
import type {
  ShiftCategory,
} from '@/lib/types'


export function CategoriesPanel({ categories }: { categories: ShiftCategory[] }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('16:00')
  const [isPending, startTransition] = useTransition()

  function add() {
    if (!name.trim()) return
    if (start === end) {
      toast.error('Start and end time cannot be exactly the same')
      return
    }
    startTransition(async () => {
      try {
        await createCategory({
          name,
          startTime: start,
          endTime: end,
          type: 'regular',
          abbreviation: '',
          timeOfDay: 'morning',
          color: '#2563eb',
        })
        setName('')
        toast.success('Category added')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to add category')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="size-5 text-primary" /> Shift Categories
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Define your standard shifts (e.g. "เวรเช้า" from 08:00 to 16:00).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
            <Label className="text-xs">Shift Name</Label>
            <Input
              placeholder="e.g. เวรเช้า"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 w-28">
            <Label className="text-xs">Start</Label>
            <Input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 w-28">
            <Label className="text-xs">End</Label>
            <Input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <Button onClick={add} disabled={isPending || !name.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {categories?.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No categories yet. Create your first shift type above.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border mt-4">
            {categories?.map((cat) => (
              <li key={cat.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-medium mr-2">{cat.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {cat.startTime}–{cat.endTime} ({shiftHours(cat.startTime, cat.endTime)}h)
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => startTransition(async () => {
                    await deleteCategory(cat.id)
                    toast.success('Category removed')
                  })}
                  disabled={isPending}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}