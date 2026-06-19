import type { Profile } from '~/types/database'

/**
 * Global guard: a signed-in user whose account is not yet approved is held on
 * the /pending screen and cannot reach any app route. Approval status lives on
 * the profile (set by an admin in the user-management section).
 */
const OPEN_ROUTES = ['/login', '/confirm', '/pending', '/forgot-password', '/reset-password']

export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  // Not signed in: the Supabase module handles the login redirect.
  if (!user.value) return
  if (OPEN_ROUTES.includes(to.path)) return

  const supabase = useSupabaseClient()
  const profile = useState<Profile | null>('current-profile')

  if (!profile.value) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()
    profile.value = (data as Profile | null) ?? null
  }

  if (profile.value && profile.value.status !== 'approved') {
    return navigateTo('/pending')
  }
})
