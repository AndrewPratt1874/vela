<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { Customer, IssuePriority, PersonRef, Ticket, TicketCategory, TicketStatus } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const supabase = useSupabaseClient()
const toast = useToast()
const { TICKET_STATUSES, TICKET_CATEGORIES, statusMap, categoryMap } = useTicketMeta()
const { ISSUE_PRIORITIES, priorityMap } = useIssueMeta()

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
const priorityFilter = ref<IssuePriority[]>([])
const search = ref('')
const statusItems = TICKET_STATUSES.map((s) => ({ label: s.label, value: s.value, icon: s.icon }))
const categoryItems = TICKET_CATEGORIES.map((c) => ({ label: c.label, value: c.value, icon: c.icon }))
const priorityItems = ISSUE_PRIORITIES.map((p) => ({ label: p.label, value: p.value, icon: p.icon }))

const filtered = computed(() =>
  (tickets.value ?? []).filter((t) => {
    if (statusFilter.value.length && !statusFilter.value.includes(t.status)) return false
    if (categoryFilter.value.length && !categoryFilter.value.includes(t.category)) return false
    if (priorityFilter.value.length && !priorityFilter.value.includes(t.priority)) return false
    if (search.value) {
      const q = search.value.toLowerCase()
      if (!t.subject.toLowerCase().includes(q) && !String(t.number).includes(q)) return false
    }
    return true
  }),
)

// Click-to-sort. Priority/status/category sort by their meaningful order
// (severity / workflow), not alphabetically.
type SortKey = 'number' | 'subject' | 'priority' | 'category' | 'customer' | 'status' | 'assignee' | 'updated'
// Persisted in a cookie so the choice survives reloads (SSR-safe: no flash).
const sortPref = useCookie<{ key: SortKey, dir: 'asc' | 'desc' }>('vela-tickets-sort', {
  default: () => ({ key: 'updated', dir: 'desc' }),
  sameSite: 'lax',
})
function toggleSort(key: SortKey) {
  const { key: curKey, dir } = sortPref.value
  sortPref.value = curKey === key
    ? { key, dir: dir === 'asc' ? 'desc' : 'asc' }
    // Recency/number feel natural newest-first; everything else A→Z first.
    : { key, dir: key === 'updated' || key === 'number' ? 'desc' : 'asc' }
}
const sortIcon = (key: SortKey) =>
  sortPref.value.key !== key ? 'i-lucide-chevrons-up-down' : sortPref.value.dir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'

const priorityRank = Object.fromEntries(ISSUE_PRIORITIES.map((p, i) => [p.value, i]))
const statusRank = Object.fromEntries(TICKET_STATUSES.map((s, i) => [s.value, i]))
const categoryRank = Object.fromEntries(TICKET_CATEGORIES.map((c, i) => [c.value, i]))

const sorted = computed(() => {
  const dir = sortPref.value.dir === 'asc' ? 1 : -1
  const val = (t: Row): string | number => {
    switch (sortPref.value.key) {
      case 'number': return t.number
      case 'subject': return t.subject.toLowerCase()
      case 'priority': return priorityRank[t.priority]
      case 'category': return categoryRank[t.category]
      case 'status': return statusRank[t.status]
      case 'customer': return t.customer?.name?.toLowerCase() ?? ''
      case 'assignee': return (t.assignee?.full_name ?? t.assignee?.email ?? '').toLowerCase()
      case 'updated': return t.updated_at
    }
  }
  return [...filtered.value].sort((a, b) => {
    const av = val(a), bv = val(b)
    return av < bv ? -dir : av > bv ? dir : 0
  })
})

function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

// Inline triage: update a single field optimistically, reverting on failure.
// DB triggers handle the activity log + in-app notifications; status changes
// also send the email notification (mirrors the ticket detail page).
async function setField<K extends 'status' | 'priority' | 'category'>(t: Row, key: K, value: Row[K]) {
  if (t[key] === value) return
  const prev = t[key]
  t[key] = value
  const { error } = await supabase.from('tickets').update({ [key]: value } as Partial<Ticket>).eq('id', t.id)
  if (error) {
    t[key] = prev
    toast.add({ title: 'Update failed', description: error.message, color: 'error' })
    return
  }
  if (key === 'status') await notifyTicketEvent(t.id, 'status')
}

const statusMenu = (t: Row) => [TICKET_STATUSES.map((s) => ({
  label: s.label, icon: s.icon, onSelect: () => setField(t, 'status', s.value),
}))]
const priorityMenu = (t: Row) => [ISSUE_PRIORITIES.map((p) => ({
  label: p.label, icon: p.icon, onSelect: () => setField(t, 'priority', p.value),
}))]
const categoryMenu = (t: Row) => [TICKET_CATEGORIES.map((c) => ({
  label: c.label, icon: c.icon, onSelect: () => setField(t, 'category', c.value),
}))]

// Delete (staff only — this whole page is staff-gated; RLS also enforces).
async function deleteTicket(t: Row) {
  if (!confirm(`Delete ticket #${t.number}? This also removes its comments and attachments. This can't be undone.`)) return
  const { error } = await supabase.from('tickets').delete().eq('id', t.id)
  if (error) {
    toast.add({ title: 'Delete failed', description: error.message, color: 'error' })
    return
  }
  tickets.value = (tickets.value ?? []).filter((x) => x.id !== t.id)
  toast.add({ title: `Ticket #${t.number} deleted`, color: 'success' })
}
const rowMenu = (t: Row) => [[
  { label: 'Open', icon: 'i-lucide-arrow-up-right', to: `/tickets/${t.id}` },
  { label: 'Delete ticket', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteTicket(t) },
]]
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
          <USelectMenu
            v-model="priorityFilter"
            :items="priorityItems"
            value-key="value"
            multiple
            placeholder="Priority"
            icon="i-lucide-signal"
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

      <div v-else>
        <!-- Column headers (click to sort) -->
        <div class="flex items-center gap-3 px-4 py-2 border-b border-default bg-elevated/30 text-xs font-medium uppercase tracking-wide text-muted">
          <span class="w-4 shrink-0" />
          <button type="button" class="w-12 shrink-0 flex items-center gap-1 hover:text-default" @click="toggleSort('number')">#<UIcon :name="sortIcon('number')" class="size-3" /></button>
          <button type="button" class="flex-1 min-w-0 flex items-center gap-1 hover:text-default" @click="toggleSort('subject')">Subject<UIcon :name="sortIcon('subject')" class="size-3" /></button>
          <button type="button" class="w-28 shrink-0 hidden sm:flex items-center gap-1 hover:text-default" @click="toggleSort('priority')">Priority<UIcon :name="sortIcon('priority')" class="size-3" /></button>
          <button type="button" class="w-28 shrink-0 hidden md:flex items-center gap-1 hover:text-default" @click="toggleSort('category')">Category<UIcon :name="sortIcon('category')" class="size-3" /></button>
          <button type="button" class="w-36 shrink-0 hidden lg:flex items-center gap-1 hover:text-default" @click="toggleSort('customer')">Customer<UIcon :name="sortIcon('customer')" class="size-3" /></button>
          <button type="button" class="w-36 shrink-0 hidden sm:flex items-center gap-1 hover:text-default" @click="toggleSort('status')">Status<UIcon :name="sortIcon('status')" class="size-3" /></button>
          <button type="button" class="w-8 shrink-0 hidden sm:flex items-center gap-1 justify-center hover:text-default" @click="toggleSort('assignee')"><UIcon :name="sortIcon('assignee')" class="size-3" /></button>
          <button type="button" class="w-24 shrink-0 hidden xl:flex items-center gap-1 hover:text-default" @click="toggleSort('updated')">Updated<UIcon :name="sortIcon('updated')" class="size-3" /></button>
          <span class="w-8 shrink-0" />
        </div>

        <ul class="divide-y divide-default">
          <li v-for="t in sorted" :key="t.id" class="group flex items-center gap-3 px-4 py-3 hover:bg-elevated/50">
            <UIcon :name="statusMap[t.status].icon" :class="`text-${statusMap[t.status].color}`" class="size-4 shrink-0" />
            <NuxtLink :to="`/tickets/${t.id}`" class="text-xs text-muted font-mono shrink-0 w-12 hover:underline">#{{ t.number }}</NuxtLink>
            <NuxtLink :to="`/tickets/${t.id}`" class="text-sm flex-1 min-w-0 truncate hover:underline">{{ t.subject }}</NuxtLink>
            <span class="w-28 shrink-0 hidden sm:flex">
              <UDropdownMenu :items="priorityMenu(t)" :content="{ align: 'start' }">
                <UBadge variant="soft" :color="priorityMap[t.priority].color" :icon="priorityMap[t.priority].icon" :label="priorityMap[t.priority].label" size="sm" class="cursor-pointer" />
              </UDropdownMenu>
            </span>
            <span class="w-28 shrink-0 hidden md:flex">
              <UDropdownMenu :items="categoryMenu(t)" :content="{ align: 'start' }">
                <UBadge variant="soft" :color="categoryMap[t.category].color" :label="categoryMap[t.category].label" size="sm" class="cursor-pointer" />
              </UDropdownMenu>
            </span>
            <span class="w-36 shrink-0 hidden lg:flex min-w-0">
              <UBadge v-if="t.customer" variant="outline" color="neutral" size="sm" :label="t.customer.name" class="max-w-full truncate" />
            </span>
            <span class="w-36 shrink-0 hidden sm:flex">
              <UDropdownMenu :items="statusMenu(t)" :content="{ align: 'start' }">
                <UBadge variant="subtle" :color="statusMap[t.status].color" :label="statusMap[t.status].label" size="sm" class="cursor-pointer" />
              </UDropdownMenu>
            </span>
            <span class="w-8 shrink-0 hidden sm:flex justify-center">
              <UAvatar
                v-if="t.assignee"
                :alt="t.assignee.full_name ?? t.assignee.email ?? ''"
                :src="t.assignee.avatar_url ?? undefined"
                size="2xs"
              />
              <UIcon v-else name="i-lucide-user" class="size-4 text-dimmed" />
            </span>
            <NuxtLink :to="`/tickets/${t.id}`" class="w-24 shrink-0 hidden xl:block text-xs text-dimmed hover:underline">{{ timeAgo(t.updated_at) }}</NuxtLink>
            <span class="w-8 shrink-0 flex justify-center">
              <UDropdownMenu :items="rowMenu(t)" :content="{ align: 'end' }">
                <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" size="xs" square class="opacity-0 group-hover:opacity-100" @click.stop />
              </UDropdownMenu>
            </span>
          </li>
          <li v-if="!sorted.length" class="p-8 text-center text-sm text-muted">No tickets match.</li>
        </ul>
      </div>
    </template>
  </UDashboardPanel>
</template>
