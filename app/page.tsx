import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import {
  getLocations,
  getRoles,
  getEmployees,
  getShiftTemplates,
} from '@/app/actions/data'
import { getShiftsForWeek } from '@/app/actions/schedule'
import { formatDate } from '@/lib/scheduler'
import { Dashboard } from '@/components/dashboard'

/** Sunday of the week containing `d`, as YYYY-MM-DD. */
function weekStartOf(d: Date): string {
  const s = new Date(d)
  s.setDate(s.getDate() - s.getDay())
  s.setHours(0, 0, 0, 0)
  return formatDate(s)
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const session = await getSession()
  if (!session?.user) redirect('/sign-in')

  const { week } = await searchParams
  const weekStart = week ?? weekStartOf(new Date())

  const [locations, roles, employees, templates, shifts] = await Promise.all([
    getLocations(),
    getRoles(),
    getEmployees(),
    getShiftTemplates(),
    getShiftsForWeek(weekStart),
  ])

  return (
    <Dashboard
      userName={session.user.name}
      weekStart={weekStart}
      locations={locations}
      roles={roles}
      employees={employees}
      templates={templates}
      shifts={shifts}
    />
  )
}
