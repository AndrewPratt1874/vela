<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { PersonRef, TicketEvent } from '~/types/database'

const props = defineProps<{ ticketId: string }>()

const supabase = useSupabaseClient()
const { statusMap, categoryMap } = useTicketMeta()
const { priorityMap } = useIssueMeta()

const { data: events, refresh } = useAsyncData(`ticket-events-${props.ticketId}`, async () => {
  const { data } = await supabase
    .from('ticket_events')
    .select('*, actor:profiles(id, full_name, email, avatar_url)')
    .eq('ticket_id', props.ticketId)
    .order('created_at', { ascending: false })
  return (data ?? []) as Array<TicketEvent & { actor: PersonRef | null }>
})

defineExpose({ refresh })

// Resolve any user ids referenced by "assigned" events to names.
const names = ref<Record<string, string>>({})
watchEffect(async () => {
  const ids = new Set<string>()
  for (const e of events.value ?? []) {
    if (e.type === 'assigned') {
      if (e.data.from) ids.add(e.data.from)
      if (e.data.to) ids.add(e.data.to)
    }
  }
  if (!ids.size) return
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', [...ids])
  const map: Record<string, string> = {}
  for (const p of data ?? []) map[p.id] = p.full_name ?? p.email ?? 'Someone'
  names.value = map
})

function actorName(e: TicketEvent & { actor: PersonRef | null }) {
  return e.actor?.full_name ?? e.actor?.email ?? 'Someone'
}

function iconFor(type: string) {
  return {
    created: 'i-lucide-circle-plus',
    status_changed: 'i-lucide-circle-dot',
    assigned: 'i-lucide-user',
    priority_changed: 'i-lucide-flag',
    category_changed: 'i-lucide-tag',
    commented: 'i-lucide-message-square',
  }[type] ?? 'i-lucide-dot'
}

function describe(e: TicketEvent & { actor: PersonRef | null }): string {
  const who = actorName(e)
  switch (e.type) {
    case 'created':
      return `${who} opened this ticket`
    case 'status_changed':
      return `${who} changed status to ${statusMap[e.data.to as keyof typeof statusMap]?.label ?? e.data.to}`
    case 'assigned':
      return e.data.to
        ? `${who} assigned this to ${names.value[e.data.to] ?? '…'}`
        : `${who} unassigned this ticket`
    case 'priority_changed':
      return `${who} set priority to ${priorityMap[e.data.to as keyof typeof priorityMap]?.label ?? e.data.to}`
    case 'category_changed':
      return `${who} set category to ${categoryMap[e.data.to as keyof typeof categoryMap]?.label ?? e.data.to}`
    case 'commented':
      return `${who} replied`
    default:
      return `${who} updated this ticket`
  }
}

function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}
</script>

<template>
  <div>
    <p class="text-xs uppercase tracking-wide text-muted mb-3">Activity</p>
    <ol class="relative space-y-3">
      <li v-for="e in events" :key="e.id" class="flex gap-3">
        <span class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-elevated border border-default">
          <UIcon :name="iconFor(e.type)" class="size-3.5 text-muted" />
        </span>
        <div class="min-w-0">
          <p class="text-sm leading-snug">{{ describe(e) }}</p>
          <p class="text-xs text-dimmed">{{ timeAgo(e.created_at) }}</p>
        </div>
      </li>
      <li v-if="!events?.length" class="text-sm text-dimmed">No activity yet.</li>
    </ol>
  </div>
</template>
