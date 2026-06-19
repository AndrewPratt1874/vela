<script setup lang="ts">
import type { PersonRef, Ticket } from '~/types/database'

const route = useRoute()
const supabase = useSupabaseClient()
const { statusMap, categoryMap } = useTicketMeta()
const id = computed(() => route.params.id as string)

const { data: ticket } = await useAsyncData(`portal-ticket-${id.value}`, async () => {
  const { data } = await supabase
    .from('tickets')
    .select('*, creator:profiles!tickets_created_by_fkey(id, full_name, email, avatar_url)')
    .eq('id', id.value)
    .single()
  return data as (Ticket & { creator: PersonRef | null }) | null
}, { watch: [id] })

if (!ticket.value) {
  throw createError({ statusCode: 404, statusMessage: 'Ticket not found' })
}
</script>

<template>
  <UDashboardPanel id="portal-ticket">
    <template #header>
      <UDashboardNavbar :title="`#${ticket!.number}`" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton variant="ghost" to="/portal/tickets" icon="i-lucide-arrow-left" label="Back" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 max-w-3xl space-y-5">
        <div class="flex items-start justify-between gap-3">
          <h1 class="text-xl font-semibold">{{ ticket!.subject }}</h1>
          <div class="flex items-center gap-2 shrink-0">
            <UBadge variant="soft" :color="categoryMap[ticket!.category].color" :label="categoryMap[ticket!.category].label" />
            <UBadge variant="subtle" :color="statusMap[ticket!.status].color" :label="statusMap[ticket!.status].label" />
          </div>
        </div>

        <TicketConversation
          :ticket-id="ticket!.id"
          :customer-id="ticket!.customer_id"
          :body="ticket!.body"
          :reporter="ticket!.creator"
          :created-at="ticket!.created_at"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
