<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ middleware: 'staff' })

const supabase = useSupabaseClient()
const toast = useToast()

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens'),
  domains: z.string().optional(),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ name: '', slug: '', domains: '' })

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

watch(() => state.name, (name) => {
  if (name && !state.slug) state.slug = slugify(name)
})

function parseDomains(raw: string | undefined): string[] {
  return [...new Set(
    (raw ?? '')
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  )]
}

const loading = ref(false)

async function submit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  const { data: customer, error } = await supabase
    .from('customers')
    .insert({ name: event.data.name, slug: event.data.slug })
    .select()
    .single()

  if (error || !customer) {
    loading.value = false
    toast.add({ title: 'Could not create customer', description: error?.message, color: 'error' })
    return
  }

  const domains = parseDomains(event.data.domains)
  if (domains.length) {
    const { error: domErr } = await supabase
      .from('customer_domains')
      .insert(domains.map((domain) => ({ domain, customer_id: customer.id })))
    if (domErr) {
      loading.value = false
      toast.add({
        title: 'Customer created, but some domains failed',
        description: `${domErr.message} (a domain may already belong to another customer)`,
        color: 'warning',
      })
      await navigateTo(`/customers/${customer.slug}`)
      return
    }
  }

  loading.value = false
  toast.add({
    title: 'Customer added',
    description: `${customer.name} has been added.`,
    color: 'success',
  })
  await navigateTo('/customers')
}
</script>

<template>
  <UDashboardPanel id="new-customer">
    <template #header>
      <UDashboardNavbar title="New customer" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 max-w-xl">
        <UForm :schema="schema" :state="state" class="space-y-4" @submit="submit">
          <UFormField label="Name" name="name" required>
            <UInput v-model="state.name" placeholder="Acme Ltd" class="w-full" />
          </UFormField>

          <UFormField label="Slug" name="slug" required help="Used in URLs">
            <UInput v-model="state.slug" placeholder="acme" class="w-full" />
          </UFormField>

          <UFormField
            label="Email domains"
            name="domains"
            help="One or more, separated by spaces or commas. Users who sign up with these domains are auto-allocated to this customer."
          >
            <UTextarea
              v-model="state.domains"
              :rows="3"
              placeholder="acme.com, acme.co.uk"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" to="/customers" label="Cancel" />
            <UButton type="submit" :loading="loading" label="Create customer" color="primary" />
          </div>
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
