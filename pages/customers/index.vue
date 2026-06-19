<script setup lang="ts">
import type { Customer } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const supabase = useSupabaseClient()

const { data: customers } = await useAsyncData('customers-list', async () => {
  const { data } = await supabase
    .from('customers')
    .select('*, projects:projects(count), domains:customer_domains(domain)')
    .order('name')
  return (data ?? []) as Array<
    Customer & { projects: { count: number }[], domains: { domain: string }[] }
  >
})
</script>

<template>
  <UDashboardPanel id="customers">
    <template #header>
      <UDashboardNavbar title="Customers" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton to="/customers/new" icon="i-lucide-plus" label="New customer" color="primary" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6">
        <div v-if="!customers?.length" class="rounded-lg border border-dashed border-default p-12 text-center">
          <UIcon name="i-lucide-building-2" class="size-10 mx-auto mb-3 text-dimmed" />
          <h2 class="font-semibold mb-1">No customers yet</h2>
          <p class="text-sm text-muted mb-4">
            Create a customer and assign their email domains so users auto-allocate on signup.
          </p>
          <UButton to="/customers/new" label="Create customer" color="primary" />
        </div>

        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="customer in customers"
            :key="customer.id"
            :to="`/customers/${customer.slug}`"
            class="block"
          >
            <UCard class="hover:border-primary transition h-full" :ui="{ body: 'space-y-2' }">
              <div class="flex items-start justify-between gap-2">
                <span class="flex items-center gap-2 min-w-0">
                  <CustomerLogo :name="customer.name" :src="customer.logo_url" size="xs" />
                  <span class="font-medium truncate">{{ customer.name }}</span>
                </span>
                <UBadge variant="subtle" size="sm" :label="`${customer.projects?.[0]?.count ?? 0} projects`" />
              </div>
              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="d in customer.domains"
                  :key="d.domain"
                  variant="outline"
                  color="neutral"
                  size="sm"
                  :label="d.domain"
                />
                <span v-if="!customer.domains?.length" class="text-xs text-dimmed">No domains</span>
              </div>
            </UCard>
          </NuxtLink>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
