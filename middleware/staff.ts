import type { Profile } from '~/types/database'

/**
 * Route guard for staff-only (admin) pages. Non-staff users are sent to the
 * customer portal. Add `definePageMeta({ middleware: 'staff' })` to a page.
 */
export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser()
  if (!user.value) return navigateTo('/login')

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

  if (!profile.value?.is_staff) {
    return navigateTo('/portal')
  }
})
