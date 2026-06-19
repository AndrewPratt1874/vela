<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Customer } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const route = useRoute()

const { data: customers } = await useAsyncData('new-project-customers', async () => {
  const { data } = await supabase.from('customers').select('id, name, slug').order('name')
  return (data ?? []) as Pick<Customer, 'id' | 'name' | 'slug'>[]
})

const customerItems = computed(() =>
  (customers.value ?? []).map((c) => ({ label: c.name, value: c.id })),
)

const schema = z.object({
  customer_id: z.string().uuid('Select a customer'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  key: z
    .string()
    .min(2, 'Key must be 2-5 letters')
    .max(5, 'Key must be 2-5 letters')
    .regex(/^[A-Z]+$/, 'Uppercase letters only'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens'),
  description: z.string().optional(),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  // pre-select customer when arriving from a customer page (?customer=<id>)
  customer_id: (route.query.customer as string) || undefined,
  name: '',
  key: '',
  slug: '',
  description: '',
})

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

watch(() => state.name, (name) => {
  if (!name) return
  if (!state.slug || state.slug === slugify(state.name ?? '').slice(0, -1)) {
    state.slug = slugify(name)
  }
  if (!state.key) {
    state.key = name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4)
  }
})

const loading = ref(false)

async function submit(event: FormSubmitEvent<Schema>) {
  if (!user.value) return
  loading.value = true
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: event.data.name,
      key: event.data.key,
      slug: event.data.slug,
      description: event.data.description || null,
      owner_id: user.value.id,
      customer_id: event.data.customer_id,
    })
    .select()
    .single()
  loading.value = false

  if (error) {
    toast.add({ title: 'Could not create project', description: error.message, color: 'error' })
    return
  }
  toast.add({ title: 'Project created', color: 'success' })
  await navigateTo(`/projects/${data.slug}`)
}
</script>

<template>
  <UDashboardPanel id="new-project">
    <template #header>
      <UDashboardNavbar title="New project" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 max-w-xl">
        <UForm :schema="schema" :state="state" class="space-y-4" @submit="submit">
          <UFormField label="Customer" name="customer_id" required help="Which customer this project belongs to">
            <USelectMenu
              v-model="state.customer_id"
              :items="customerItems"
              value-key="value"
              placeholder="Select a customer"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Name" name="name" required>
            <UInput v-model="state.name" placeholder="Web platform" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Key" name="key" required help="2-5 letter prefix, e.g. WEB">
              <UInput v-model="state.key" placeholder="WEB" class="w-full" />
            </UFormField>
            <UFormField label="Slug" name="slug" required help="Used in URLs">
              <UInput v-model="state.slug" placeholder="web-platform" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Description" name="description">
            <UTextarea v-model="state.description" :rows="3" class="w-full" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" to="/projects" label="Cancel" />
            <UButton type="submit" :loading="loading" label="Create project" color="primary" />
          </div>
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
