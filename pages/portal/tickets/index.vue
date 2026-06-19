<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { Ticket } from '~/types/database'

const supabase = useSupabaseClient()
const { customerId } = useCurrentProfile()
const { statusMap, categoryMap } = useTicketMeta()

const { data: tickets } = await useAsyncData('portal-tickets', async () => {
  if (!customerId.value) return []
  const { data } = await supabase
    .from('tickets')
    .select('*')
    .order('updated_at', { ascending: false })
  return (data ?? []) as Ticket[]
}, { watch: [customerId] })

function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}
</script>

<template>
  <UDashboardPanel id="portal-tickets">
    <template #header>
      <UDashboardNavbar title="Tickets" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton to="/portal/tickets/new" icon="i-lucide-plus" label="New ticket" color="primary" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!tickets?.length" class="p-12 text-center">
        <UIcon name="i-lucide-ticket" class="size-10 mx-auto mb-3 text-dimmed" />
        <h2 class="font-semibold mb-1">No tickets yet</h2>
        <p class="text-sm text-muted mb-4">Raise a ticket and we'll get back to you.</p>
        <UButton to="/portal/tickets/new" label="New ticket" color="primary" />
      </div>

      <ul v-else class="divide-y divide-default">
        <li v-for="t in tickets" :key="t.id">
          <NuxtLink :to="`/portal/tickets/${t.id}`" class="flex items-center gap-3 px-4 py-3 hover:bg-elevated/50">
            <UIcon :name="statusMap[t.status].icon" :class="`text-${statusMap[t.status].color}`" class="size-4 shrink-0" />
            <span class="text-xs text-muted font-mono shrink-0 w-10">#{{ t.number }}</span>
            <span class="text-sm flex-1 truncate">{{ t.subject }}</span>
            <UBadge variant="soft" :color="categoryMap[t.category].color" :label="categoryMap[t.category].label" size="sm" class="hidden sm:inline-flex" />
            <UBadge variant="subtle" :color="statusMap[t.status].color" :label="statusMap[t.status].label" size="sm" />
            <span class="text-xs text-dimmed shrink-0 hidden sm:inline">{{ timeAgo(t.updated_at) }}</span>
          </NuxtLink>
        </li>
      </ul>
    </template>
  </UDashboardPanel>
</template>
