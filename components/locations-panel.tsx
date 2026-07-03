'use client'

import { useState, useTransition } from 'react'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { createLocation, deleteLocation } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { Location } from '@/lib/types'

export function LocationsPanel({ locations }: { locations: Location[] }) {
  const [name, setName] = useState('')
  const [isPending, startTransition] = useTransition()

  function add() {
    if (!name.trim()) return
    startTransition(async () => {
      try {
        await createLocation(name)
        setName('')
        toast.success('Location added')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to add location')
      }
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteLocation(id)
      toast.success('Location removed')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="size-5 text-primary" /> Locations
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The sites or departments where shifts take place.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Input
            placeholder="e.g. Downtown Store"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={isPending || !name.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </form>

        {locations.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No locations yet. Add your first one above.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {locations.map((loc) => (
              <li
                key={loc.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="font-medium">{loc.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(loc.id)}
                  disabled={isPending}
                  aria-label={`Delete ${loc.name}`}
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
