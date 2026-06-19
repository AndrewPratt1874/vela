<script setup lang="ts">
import type { Customer, PersonRef, Project, Ticket } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const route = useRoute()
const supabase = useSupabaseClient()
const toast = useToast()
const user = useSupabaseUser()
const id = computed(() => route.params.id as string)

const { TICKET_STATUSES, TICKET_CATEGORIES, statusMap } = useTicketMeta()
const { ISSUE_PRIORITIES } = useIssueMeta()

const { data: ticket, refresh } = await useAsyncData(`staff-ticket-${id.value}`, async () => {
  const { data } = await supabase
    .from('tickets')
    .select('*, creator:profiles!tickets_created_by_fkey(id, full_name, email, avatar_url), customer:customers(id, name, slug)')
    .eq('id', id.value)
    .single()
  return data as (Ticket & { creator: PersonRef | null, customer: Pick<Customer, 'id' | 'name' | 'slug'> | null }) | null
}, { watch: [id] })

if (!ticket.value) {
  throw createError({ statusCode: 404, statusMessage: 'Ticket not found' })
}

const { data: staff } = await useAsyncData('staff-list', async () => {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('is_staff', true)
    .order('email')
  return (data ?? []) as PersonRef[]
})

const statusItems = TICKET_STATUSES.map((s) => ({ label: s.label, value: s.value, icon: s.icon }))
const categoryItems = TICKET_CATEGORIES.map((c) => ({ label: c.label, value: c.value, icon: c.icon }))
const priorityItems = ISSUE_PRIORITIES.map((p) => ({ label: p.label, value: p.value, icon: p.icon }))
const assigneeItems = computed(() => [
  { label: 'Unassigned', value: null },
  ...(staff.value ?? []).map((s) => ({ label: s.full_name ?? s.email ?? 'Unknown', value: s.id })),
])

async function update(payload: Partial<Ticket>, notify?: 'status' | 'assigned') {
  const { error } = await supabase.from('tickets').update(payload).eq('id', ticket.value!.id)
  if (error) {
    toast.add({ title: 'Update failed', description: error.message, color: 'error' })
    return
  }
  await refresh()
  if (notify) await notifyTicketEvent(ticket.value!.id, notify)
}

// --- Promote to issue ---------------------------------------------------
const { data: projects } = await useAsyncData(`ticket-cust-projects-${id.value}`, async () => {
  const { data } = await supabase
    .from('projects')
    .select('id, name, slug, key')
    .eq('customer_id', ticket.value!.customer_id)
    .order('name')
  return (data ?? []) as Pick<Project, 'id' | 'name' | 'slug' | 'key'>[]
}, { watch: [() => ticket.value?.customer_id] })

const { data: linkedIssues, refresh: refreshLinked } = await useAsyncData(`ticket-linked-${id.value}`, async () => {
  const { data } = await supabase
    .from('issues')
    .select('number, project:projects(slug, key)')
    .eq('source_ticket_id', id.value)
  return (data ?? []) as Array<{ number: number, project: { slug: string, key: string } | null }>
}, { watch: [id] })

const promoteOpen = ref(false)
const promoteProjectId = ref<string | undefined>(undefined)
const promoting = ref(false)
const projectItems = computed(() => (projects.value ?? []).map((p) => ({ label: `${p.name} (${p.key})`, value: p.id })))

async function promote() {
  if (!user.value || !promoteProjectId.value) return
  promoting.value = true
  const proj = projects.value?.find((p) => p.id === promoteProjectId.value)
  const { data, error } = await supabase
    .from('issues')
    .insert({
      project_id: promoteProjectId.value,
      title: ticket.value!.subject,
      description: ticket.value!.body,
      reporter_id: user.value.id,
      type: 'task',
      source_ticket_id: ticket.value!.id,
    })
    .select()
    .single()
  promoting.value = false
  if (error || !data) {
    toast.add({ title: 'Could not promote', description: error?.message, color: 'error' })
    return
  }
  promoteOpen.value = false
  await refreshLinked()
  toast.add({ title: `Created ${proj?.key}-${data.number}`, color: 'success' })
  await navigateTo(`/projects/${proj?.slug}/issues/${data.number}`)
}
</script>

<template>
  <UDashboardPanel id="staff-ticket">
    <template #header>
      <UDashboardNavbar :title="`#${ticket!.number}`" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-git-branch-plus" label="Promote to issue" variant="subtle" @click="promoteOpen = true" />
          <UButton variant="ghost" to="/tickets" icon="i-lucide-arrow-left" label="All tickets" />
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
          />
        </div>

        <aside class="space-y-4 h-fit rounded-lg border border-default bg-elevated/50 p-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Customer</p>
            <NuxtLink v-if="ticket!.customer" :to="`/customers/${ticket!.customer.slug}`" class="text-sm hover:underline">
              {{ ticket!.customer.name }}
            </NuxtLink>
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
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Assignee</p>
            <USelectMenu
              :model-value="ticket!.assigned_to"
              :items="assigneeItems"
              value-key="value"
              class="w-full"
              @update:model-value="(v: any) => update({ assigned_to: v }, 'assigned')"
            />
          </div>
          <div v-if="linkedIssues?.length">
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Linked issues</p>
            <div class="space-y-1">
              <NuxtLink
                v-for="li in linkedIssues"
                :key="`${li.project?.key}-${li.number}`"
                :to="`/projects/${li.project?.slug}/issues/${li.number}`"
                class="flex items-center gap-1.5 text-sm font-mono hover:underline"
              >
                <UIcon name="i-lucide-git-branch" class="size-3.5 text-muted" />
                {{ li.project?.key }}-{{ li.number }}
              </NuxtLink>
            </div>
          </div>
        </aside>
      </div>

      <UModal v-model:open="promoteOpen" title="Promote to issue">
        <template #body>
          <div class="space-y-3">
            <p class="text-sm text-muted">
              Create an internal issue from this ticket. It'll be linked back here.
            </p>
            <UFormField label="Project">
              <USelectMenu
                v-model="promoteProjectId"
                :items="projectItems"
                value-key="value"
                placeholder="Select a project"
                class="w-full"
              />
            </UFormField>
            <p v-if="!projects?.length" class="text-xs text-warning">
              This customer has no projects yet — create one first.
            </p>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton variant="ghost" label="Cancel" @click="promoteOpen = false" />
            <UButton
              label="Create issue"
              color="primary"
              :loading="promoting"
              :disabled="!promoteProjectId"
              @click="promote"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
