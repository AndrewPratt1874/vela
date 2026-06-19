import type { Profile } from '~/types/database'

/**
 * Loads the signed-in user's profile row (is_staff, customer_id, ...).
 * Cached in shared state so every component sees the same value.
 */
export function useCurrentProfile() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const profile = useState<Profile | null>('current-profile', () => null)

  const { pending, refresh } = useAsyncData(
    'current-profile',
    async () => {
      if (!user.value) {
        profile.value = null
        return null
      }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.value.id)
        .single()
      profile.value = (data as Profile | null) ?? null
      return profile.value
    },
    { watch: [user] },
  )

  const isStaff = computed(() => profile.value?.is_staff ?? false)
  const customerId = computed(() => profile.value?.customer_id ?? null)

  return { profile, isStaff, customerId, pending, refresh }
}
