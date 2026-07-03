import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * Returns the current user's id, or throws if there is no active session.
 * Every server action that touches user data must scope queries by this id
 * because Neon has no row-level security.
 */
export async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}
