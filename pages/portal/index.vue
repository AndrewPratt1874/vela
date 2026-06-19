<script setup lang="ts">
import type { Customer, Project, Ticket } from '~/types/database'

const supabase = useSupabaseClient()
const { profile, customerId } = useCurrentProfile()
const { statusMap } = useTicketMeta()

const { data: customer } = await useAsyncData('portal-customer', async () => {
  if (!customerId.value) return null
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId.value)
    .single()
  return data as Customer | null
}, { watch: [customerId] })

const { data: projects } = await useAsyncData('portal-projects', async () => {
  if (!customerId.value) return []
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('customer_id', customerId.value)
    .order('created_at', { ascending: false })
  return (data ?? []) as Project[]
}, { watch: [customerId] })

const { data: tickets } = await useAsyncData('portal-home-tickets', async () => {
  if (!customerId.value) return []
  const { data } = await supabase
    .from('tickets')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(5)
  return (data ?? []) as Ticket[]
}, { watch: [customerId] })
</script>

<template>
  <UDashboardPanel id="portal">
    <template #header>
      <UDashboardNavbar :title="customer?.name ?? 'Home'" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton v-if="profile?.customer_id" to="/portal/tickets/new" icon="i-lucide-plus" label="New ticket" color="primary" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- No customer assigned yet -->
      <div v-if="!profile?.customer_id" class="p-6">
        <UCard :ui="{ body: 'text-center py-12' }">
          <UIcon name="i-lucide-clock" class="size-10 mx-auto mb-3 text-dimmed" />
          <h2 class="font-semibold mb-1">Account pending</h2>
          <p class="text-sm text-muted max-w-sm mx-auto">
            Your account isn't linked to a customer yet. We'll set this up shortly — please check back, or contact your account manager.
          </p>
        </UCard>
      </div>

      <div v-else class="p-4 lg:p-6 space-y-8">
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-semibold">Recent tickets</h2>
            <UButton to="/portal/tickets" variant="link" trailing-icon="i-lucide-arrow-right" label="View all" />
          </div>
          <div v-if="!tickets?.length" class="rounded-lg border border-dashed border-default p-8 text-center">
            <UIcon name="i-lucide-ticket" class="size-7 mx-auto mb-2 text-dimmed" />
            <p class="text-sm text-muted mb-3">No tickets yet.</p>
            <UButton to="/portal/tickets/new" size="sm" label="Raise a ticket" color="primary" />
          </div>
          <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
            <ul class="divide-y divide-default">
              <li v-for="t in tickets" :key="t.id">
                <NuxtLink :to="`/portal/tickets/${t.id}`" class="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated/50">
                  <UIcon :name="statusMap[t.status].icon" :class="`text-${statusMap[t.status].color}`" class="size-4 shrink-0" />
                  <span class="text-xs text-muted font-mono shrink-0">#{{ t.number }}</span>
                  <span class="text-sm flex-1 truncate">{{ t.subject }}</span>
                  <UBadge variant="subtle" :color="statusMap[t.status].color" :label="statusMap[t.status].label" size="sm" />
                </NuxtLink>
              </li>
            </ul>
          </UCard>
        </section>

        <section>
          <h2 class="text-base font-semibold mb-3">Your projects</h2>
          <div v-if="!projects?.length" class="rounded-lg border border-dashed border-default p-10 text-center">
            <UIcon name="i-lucide-folder" class="size-8 mx-auto mb-2 text-dimmed" />
            <p class="text-sm text-muted">No projects yet.</p>
          </div>
          <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink v-for="project in projects" :key="project.id" :to="`/projects/${project.slug}/files`" class="block">
              <UCard class="hover:border-primary transition h-full">
                <div class="flex items-start justify-between mb-1">
                  <span class="font-medium">{{ project.name }}</span>
                  <UBadge variant="outline" size="sm" :label="project.key" />
                </div>
                <p v-if="project.description" class="text-sm text-muted line-clamp-2">
                  {{ project.description }}
                </p>
              </UCard>
            </NuxtLink>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
