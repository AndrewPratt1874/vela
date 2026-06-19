import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Notification } from '~/types/database'

// Session-wide singleton: the bell can mount/unmount (layout switches, HMR),
// but there must only ever be ONE realtime channel per user. Re-subscribing to
// the same topic throws "cannot add postgres_changes callbacks ... after
// subscribe()", so we guard creation and reuse the existing channel.
let channel: RealtimeChannel | null = null
let channelUserId: string | null = null

/**
 * In-app notifications for the current user: list, unread count, mark-read,
 * with a realtime subscription so the bell updates live.
 */
export function useNotifications() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const items = useState<Notification[]>('notifications', () => [])

  const { refresh, pending } = useAsyncData(
    'notifications',
    async () => {
      if (!user.value) {
        items.value = []
        return []
      }
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30)
      items.value = (data ?? []) as Notification[]
      return items.value
    },
    { watch: [user] },
  )

  const unreadCount = computed(() => items.value.filter((n) => !n.read).length)

  async function markAllRead() {
    const unread = items.value.filter((n) => !n.read).map((n) => n.id)
    if (!unread.length) return
    items.value = items.value.map((n) => ({ ...n, read: true }))
    await supabase.from('notifications').update({ read: true }).in('id', unread)
  }

  async function markRead(id: string) {
    items.value = items.value.map((n) => (n.id === id ? { ...n, read: true } : n))
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  function teardown() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
      channelUserId = null
    }
  }

  function ensureSubscription() {
    if (!import.meta.client || !user.value) return
    // Already subscribed for this user — reuse the single channel.
    if (channel && channelUserId === user.value.id) return
    // Different user, or a leftover channel from a prior mount/HMR: clean up.
    teardown()

    const uid = user.value.id
    // Remove any orphaned channel the client still holds for this topic.
    for (const ch of supabase.getChannels()) {
      if (ch.topic === `realtime:notifications-${uid}`) supabase.removeChannel(ch)
    }

    channelUserId = uid
    channel = supabase
      .channel(`notifications-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          items.value = [payload.new as Notification, ...items.value]
        },
      )
      .subscribe()
  }

  // Live updates: set up once, and react to sign-in / sign-out.
  onMounted(ensureSubscription)
  watch(user, (u) => (u ? ensureSubscription() : teardown()))

  return { items, unreadCount, pending, refresh, markAllRead, markRead }
}
