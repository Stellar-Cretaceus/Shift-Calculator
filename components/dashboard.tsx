'use client'

import { useRouter } from 'next/navigation'
import { CalendarDays, LogOut, Users, Tags, MapPin, Settings2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CalendarView } from '@/components/calendar-view'
import { LocationsPanel } from '@/components/locations-panel'
import { RolesPanel } from '@/components/roles-panel'
import { EmployeesPanel } from '@/components/employees-panel'
import { RulesPanel } from '@/components/rules-panel'
import type {
  Employee,
  Location,
  Role,
  Shift,
  ShiftTemplate,
} from '@/lib/types'

export function Dashboard({
  userName,
  weekStart,
  locations,
  roles,
  employees,
  templates,
  shifts,
}: {
  userName: string
  weekStart: string
  locations: Location[]
  roles: Role[]
  employees: Employee[]
  templates: ShiftTemplate[]
  shifts: Shift[]
}) {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none">ShiftMaker</h1>
              <p className="text-xs text-muted-foreground">
                Auto shift scheduler
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {userName}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="calendar" className="w-full">
          <TabsList className="mb-6 flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="calendar" className="gap-1.5">
              <CalendarDays className="size-4" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5">
              <Settings2 className="size-4" /> Shift Rules
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-1.5">
              <Users className="size-4" /> Staff
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5">
              <Tags className="size-4" /> Roles
            </TabsTrigger>
            <TabsTrigger value="locations" className="gap-1.5">
              <MapPin className="size-4" /> Locations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar">
            <CalendarView
              weekStart={weekStart}
              shifts={shifts}
              roles={roles}
              employees={employees}
              locations={locations}
              hasTemplates={templates.length > 0}
            />
          </TabsContent>

          <TabsContent value="rules">
            <RulesPanel
              templates={templates}
              roles={roles}
              locations={locations}
            />
          </TabsContent>

          <TabsContent value="employees">
            <EmployeesPanel employees={employees} roles={roles} />
          </TabsContent>

          <TabsContent value="roles">
            <RolesPanel roles={roles} />
          </TabsContent>

          <TabsContent value="locations">
            <LocationsPanel locations={locations} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
