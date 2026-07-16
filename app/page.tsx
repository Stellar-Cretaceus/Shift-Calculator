import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import {
  getLocations,
  getRoles,
  getEmployees,
  getShiftTemplates,
  getCategories, // Imported from data.ts!
  getEmployeeTitles,
  getHolidays,
  
} from '@/app/actions/data'
import { getShiftsForRange } from '@/app/actions/schedule'
import { Dashboard } from '@/components/dashboard'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  const session = await getSession()
  if (!session?.user) redirect('/sign-in')

  // 1. Calculate the current month as the default view
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  
  const format = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  // 2. Unwrap the search parameters and set defaults
  const params = await searchParams
  const startDate = params.start || format(firstDay)
  const endDate = params.end || format(lastDay)

  // 3. Fetch all the data!
  const [locations, roles, employees, templates, shifts, categories, titles, holidayRows] = await Promise.all([
    getLocations(),
    getRoles(),
    getEmployees(),
    getShiftTemplates(),
    getShiftsForRange(startDate, endDate),
    getCategories(), 
    getEmployeeTitles(),
    getHolidays(),
  ])

  return (
    <Dashboard
      userName={session.user.name} // Fixed typo!
      startDate={startDate}
      endDate={endDate}
      locations={locations}
      roles={roles}
      employees={employees}
      templates={templates}
      shifts={shifts}
      categories={categories}
      titles={titles}
      holidays={holidayRows}
    />
  )
}