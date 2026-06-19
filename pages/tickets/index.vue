<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { Customer, PersonRef, Ticket, TicketCategory, TicketStatus } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const supabase = useSupabaseClient()
const { TICKET_STATUSES, TICKET_CATEGORIES, statusMap, categoryMap } = useTicketMeta()

type Row = Ticket & {
  customer: Pick<Customer, 'id' | 'name' | 'slug'> | null
  assignee: PersonRef | null
}

const { data: tickets } = await useAsyncData('staff-tickets', async () => {
  const { data } = await supabase
    .from('tickets')
    .select('*, customer:customers(id, name, slug), assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, avatar_url)')
    .order('updated_at', { ascending: false })
  return (data ?? []) as Row[]
})

const statusFilter = ref<TicketStatus[]>([])
const categoryFilter = ref<TicketCategory[]>([])
const search = ref('')
const statusItems = TICKET_STATUSES.map((s) => ({ label: s.label, value: s.value, icon: s.icon }))
const categoryItems = TICKET_CATEGORIES.map((c) => ({ label: c.label, value: c.value, icon: c.icon }))

const filtered = computed(() =>
  (tickets.value ?? []).filter((t) => {
    if (statusFilter.value.length && !statusFilter.value.includes(t.status)) return false
    if (categoryFilter.value.length && !categoryFilter.value.includes(t.category)) return false
    if (search.value && !t.subject.toLowerCase().includes(search.value.toLowerCase())) return false
    return true
  }),
)

function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}
</script>

<template>
  <UDashboardPanel id="staff-tickets">
    <template #header>
      <UDashboardNavbar title="Tickets" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton to="/tickets/new" icon="i-lucide-plus" label="New ticket" color="primary" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput v-model="search" placeholder="Search tickets..." icon="i-lucide-search" size="sm" />
          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            multiple
            placeholder="Status"
            icon="i-lucide-circle-dot"
            size="sm"
          />
          <USelectMenu
            v-model="categoryFilter"
            :items="categoryItems"
            value-key="value"
            multiple
            placeholder="Category"
            icon="i-lucide-tag"
            size="sm"
          />
        </template>
        <template #right>
          <span class="text-xs text-muted">{{ filtered.length }} / {{ tickets?.length ?? 0 }}</span>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="!tickets?.length" class="p-12 text-center">
        <UIcon name="i-lucide-ticket" class="size-10 mx-auto mb-3 text-dimmed" />
        <h2 class="font-semibold mb-1">No tickets yet</h2>
        <p class="text-sm text-muted">Customer tickets will appear here.</p>
      </div>

      <ul v-else class="divide-y divide-default">
        <li v-for="t in filtered" :key="t.id">
          <NuxtLink :to="`/tickets/${t.id}`" class="flex items-center gap-3 px-4 py-3 hover:bg-elevated/50">
            <UIcon :name="statusMap[t.status].icon" :class="`text-${statusMap[t.status].color}`" class="size-4 shrink-0" />
            <span class="text-xs text-muted font-mono shrink-0 w-10">#{{ t.number }}</span>
            <span class="text-sm flex-1 truncate">{{ t.subject }}</span>
            <UBadge variant="soft" :color="categoryMap[t.category].color" :label="categoryMap[t.category].label" size="sm" class="hidden md:inline-flex" />
            <UBadge v-if="t.customer" variant="outline" color="neutral" size="sm" :label="t.customer.name" />
            <UBadge variant="subtle" :color="statusMap[t.status].color" :label="statusMap[t.status].label" size="sm" />
            <UAvatar
              v-if="t.assignee"
              :alt="t.assignee.full_name ?? t.assignee.email ?? ''"
              :src="t.assignee.avatar_url ?? undefined"
              size="2xs"
            />
            <UIcon v-else name="i-lucide-user" class="size-4 text-dimmed" />
            <span class="text-xs text-dimmed shrink-0 hidden lg:inline">{{ timeAgo(t.updated_at) }}</span>
          </NuxtLink>
        </li>
        <li v-if="!filtered.length" class="p-8 text-center text-sm text-muted">No tickets match.</li>
      </ul>
    </template>
  </UDashboardPanel>
</template>
