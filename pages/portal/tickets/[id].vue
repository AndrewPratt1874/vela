<script setup lang="ts">
import { format, formatDistanceStrict } from 'date-fns'
import type { PersonRef, Ticket } from '~/types/database'

const route = useRoute()
const supabase = useSupabaseClient()
const toast = useToast()
const id = computed(() => route.params.id as string)

const { TICKET_STATUSES, TICKET_CATEGORIES, statusMap, categoryMap } = useTicketMeta()
const { ISSUE_PRIORITIES } = useIssueMeta()

const { data: ticket, refresh } = await useAsyncData(`portal-ticket-${id.value}`, async () => {
  const { data } = await supabase
    .from('tickets')
    .select('*, creator:profiles!tickets_created_by_fkey(id, full_name, email, avatar_url), assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, avatar_url)')
    .eq('id', id.value)
    .single()
  return data as (Ticket & { creator: PersonRef | null, assignee: PersonRef | null }) | null
}, { watch: [id] })

if (!ticket.value) {
  throw createError({ statusCode: 404, statusMessage: 'Ticket not found' })
}

const statusItems = TICKET_STATUSES.map((s) => ({ label: s.label, value: s.value, icon: s.icon }))
const categoryItems = TICKET_CATEGORIES.map((c) => ({ label: c.label, value: c.value, icon: c.icon }))
const priorityItems = ISSUE_PRIORITIES.map((p) => ({ label: p.label, value: p.value, icon: p.icon }))

const timeline = ref<{ refresh: () => Promise<void> } | null>(null)

async function update(payload: Partial<Ticket>, notify?: 'status') {
  const { error } = await supabase.from('tickets').update(payload).eq('id', ticket.value!.id)
  if (error) {
    toast.add({ title: 'Update failed', description: error.message, color: 'error' })
    return
  }
  await refresh()
  await timeline.value?.refresh()
  if (notify) await notifyTicketEvent(ticket.value!.id, notify)
}

const openedAt = computed(() => format(new Date(ticket.value!.created_at), 'd MMM yyyy, HH:mm'))
const isResolved = computed(() => !!ticket.value!.resolved_at)
const openDuration = computed(() => {
  const end = ticket.value!.resolved_at ? new Date(ticket.value!.resolved_at) : new Date()
  return formatDistanceStrict(new Date(ticket.value!.created_at), end)
})
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
      <div class="p-4 lg:p-6 grid lg:grid-cols-[1fr_260px] gap-6">
        <div class="min-w-0 space-y-5">
          <h1 class="text-xl font-semibold">{{ ticket!.subject }}</h1>
          <TicketConversation
            :ticket-id="ticket!.id"
            :customer-id="ticket!.customer_id"
            :body="ticket!.body"
            :reporter="ticket!.creator"
            :created-at="ticket!.created_at"
            @posted="timeline?.refresh()"
          />
        </div>

        <aside class="space-y-4 lg:sticky lg:top-0 lg:self-start lg:h-[calc(100dvh-8rem)] lg:overflow-y-auto rounded-lg border border-default bg-elevated/50 p-4">
          <div class="rounded-md border border-default bg-default p-3 text-sm space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-muted">Opened</span>
              <span>{{ openedAt }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">{{ isResolved ? 'Resolved in' : 'Open for' }}</span>
              <span :class="isResolved ? 'text-success font-medium' : 'font-medium'">{{ openDuration }}</span>
            </div>
          </div>

          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Status</p>
            <USelectMenu
              :model-value="ticket!.status"
              :items="statusItems"
              value-key="value"
              class="w-full"
              @update:model-value="(v: any) => update({ status: v }, 'status')"
            />
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Category</p>
            <USelectMenu
              :model-value="ticket!.category"
              :items="categoryItems"
              value-key="value"
              class="w-full"
              @update:model-value="(v: any) => update({ category: v })"
            />
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Priority</p>
            <USelectMenu
              :model-value="ticket!.priority"
              :items="priorityItems"
              value-key="value"
              class="w-full"
              @update:model-value="(v: any) => update({ priority: v })"
            />
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Handled by</p>
            <div class="flex items-center gap-2 text-sm">
              <template v-if="ticket!.assignee">
                <UAvatar :alt="ticket!.assignee.full_name ?? ticket!.assignee.email ?? ''" :src="ticket!.assignee.avatar_url ?? undefined" size="2xs" />
                <span>{{ ticket!.assignee.full_name ?? ticket!.assignee.email }}</span>
              </template>
              <span v-else class="text-dimmed">Not yet assigned</span>
            </div>
          </div>

          <USeparator />
          <TicketTimeline ref="timeline" :ticket-id="ticket!.id" />
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
