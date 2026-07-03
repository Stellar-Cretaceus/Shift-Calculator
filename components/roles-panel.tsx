'use client'

import { useState, useTransition } from 'react'
import { Tags, Plus, Trash2 } from 'lucide-react'
import { createRole, deleteRole } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ROLE_COLORS, type Role } from '@/lib/types'
import { cn } from '@/lib/utils'

export function RolesPanel({ roles }: { roles: Role[] }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(ROLE_COLORS[0])
  const [isPending, startTransition] = useTransition()

  function add() {
    if (!name.trim()) return
    startTransition(async () => {
      try {
        await createRole(name, color)
        setName('')
        toast.success('Role added')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to add role')
      }
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteRole(id)
      toast.success('Role removed')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Tags className="size-5 text-primary" /> Roles
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Positions that need to be staffed, e.g. Cashier, Cook, Manager.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Cashier"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={isPending || !name.trim()}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Color:</span>
            {ROLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Select color ${c}`}
                className={cn(
                  'size-6 rounded-full border-2 transition',
                  color === c
                    ? 'border-foreground scale-110'
                    : 'border-transparent',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </form>

        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No roles yet. Add your first one above.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {roles.map((role) => (
              <li
                key={role.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="flex items-center gap-2 font-medium">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: role.color }}
                  />
                  {role.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(role.id)}
                  disabled={isPending}
                  aria-label={`Delete ${role.name}`}
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
