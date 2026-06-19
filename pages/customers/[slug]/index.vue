<script setup lang="ts">
import type { Customer, Profile, Project } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const route = useRoute()
const supabase = useSupabaseClient()
const toast = useToast()
const slug = computed(() => route.params.slug as string)

const { data: customer } = await useAsyncData(`customer-${slug.value}`, async () => {
  const { data } = await supabase.from('customers').select('*').eq('slug', slug.value).single()
  return data as Customer | null
}, { watch: [slug] })

if (!customer.value) {
  throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
}

const { data: projects } = await useAsyncData(`customer-projects-${customer.value.id}`, async () => {
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('customer_id', customer.value!.id)
    .order('created_at', { ascending: false })
  return (data ?? []) as Project[]
})

const { data: domains, refresh: refreshDomains } = await useAsyncData(
  `customer-domains-${customer.value.id}`,
  async () => {
    const { data } = await supabase
      .from('customer_domains')
      .select('domain')
      .eq('customer_id', customer.value!.id)
      .order('domain')
    return (data ?? []).map((d) => d.domain)
  },
)

const { data: members } = await useAsyncData(`customer-members-${customer.value.id}`, async () => {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('customer_id', customer.value!.id)
    .order('email')
  return (data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]
})

// ----- Logo upload -----
const LOGO_BUCKET = 'customer-logos'
const uploadingLogo = ref(false)
const logoInput = ref<HTMLInputElement | null>(null)

function pickLogo() {
  logoInput.value?.click()
}

async function onLogoPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !customer.value) return
  if (!file.type.startsWith('image/')) {
    toast.add({ title: 'Please choose an image file', color: 'error' })
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    toast.add({ title: 'Logo must be under 2 MB', color: 'error' })
    return
  }
  uploadingLogo.value = true
  try {
    // Fixed path + upsert so replacing overwrites the same object (no orphans).
    const path = `${customer.value.id}/logo`
    const { error: upErr } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) throw upErr

    const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
    const url = `${pub.publicUrl}?v=${Date.now()}` // cache-bust the stable URL
    const { error: updErr } = await supabase
      .from('customers')
      .update({ logo_url: url })
      .eq('id', customer.value.id)
    if (updErr) throw updErr

    customer.value.logo_url = url
    toast.add({ title: 'Logo updated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Could not upload logo', description: err?.message, color: 'error' })
  } finally {
    uploadingLogo.value = false
    if (logoInput.value) logoInput.value.value = ''
  }
}

async function removeLogo() {
  if (!customer.value) return
  uploadingLogo.value = true
  try {
    await supabase.storage.from(LOGO_BUCKET).remove([`${customer.value.id}/logo`])
    await supabase.from('customers').update({ logo_url: null }).eq('id', customer.value.id)
    customer.value.logo_url = null
    toast.add({ title: 'Logo removed', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Could not remove logo', description: err?.message, color: 'error' })
  } finally {
    uploadingLogo.value = false
  }
}

const newDomain = ref('')
const addingDomain = ref(false)

async function addDomain() {
  const domain = newDomain.value.trim().toLowerCase().replace(/^@/, '')
  if (!domain) return
  addingDomain.value = true
  const { error } = await supabase
    .from('customer_domains')
    .insert({ domain, customer_id: customer.value!.id })
  addingDomain.value = false
  if (error) {
    toast.add({
      title: 'Could not add domain',
      description: `${error.message} (it may already belong to another customer)`,
      color: 'error',
    })
    return
  }
  newDomain.value = ''
  await refreshDomains()
}

async function removeDomain(domain: string) {
  const { error } = await supabase.from('customer_domains').delete().eq('domain', domain)
  if (error) {
    toast.add({ title: 'Could not remove domain', description: error.message, color: 'error' })
    return
  }
  await refreshDomains()
}
</script>

<template>
  <UDashboardPanel id="customer-detail">
    <template #header>
      <UDashboardNavbar :title="customer!.name" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #title>
          <span class="flex items-center gap-2">
            <CustomerLogo :name="customer!.name" :src="customer!.logo_url" size="xs" />
            {{ customer!.name }}
          </span>
        </template>
        <template #right>
          <UButton
            :to="`/tickets/new?customer=${customer!.id}`"
            icon="i-lucide-ticket"
            label="New ticket"
            variant="ghost"
          />
          <UButton
            :to="`/projects/new?customer=${customer!.id}`"
            icon="i-lucide-plus"
            label="New project"
            color="primary"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 grid lg:grid-cols-[1fr_320px] gap-6">
        <!-- Projects -->
        <section class="space-y-3 min-w-0">
          <h2 class="text-base font-semibold">Projects</h2>
          <div v-if="!projects?.length" class="rounded-lg border border-dashed border-default p-8 text-center">
            <UIcon name="i-lucide-folder-plus" class="size-8 mx-auto mb-2 text-dimmed" />
            <p class="text-sm text-muted mb-3">No projects for this customer yet</p>
            <UButton :to="`/projects/new?customer=${customer!.id}`" label="Create project" color="primary" />
          </div>
          <div v-else class="grid sm:grid-cols-2 gap-4">
            <NuxtLink v-for="project in projects" :key="project.id" :to="`/projects/${project.slug}`" class="block">
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

        <!-- Sidebar: logo + domains + members -->
        <aside class="space-y-6">
          <section class="space-y-2">
            <h2 class="text-sm font-semibold">Logo</h2>
            <div class="flex items-center gap-3">
              <CustomerLogo :name="customer!.name" :src="customer!.logo_url" size="xl" />
              <div class="flex flex-col gap-1">
                <UButton
                  :label="customer!.logo_url ? 'Replace' : 'Upload'"
                  icon="i-lucide-upload"
                  size="xs"
                  variant="subtle"
                  :loading="uploadingLogo"
                  @click="pickLogo"
                />
                <UButton
                  v-if="customer!.logo_url"
                  label="Remove"
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="ghost"
                  color="error"
                  :disabled="uploadingLogo"
                  @click="removeLogo"
                />
              </div>
              <input
                ref="logoInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onLogoPick"
              >
            </div>
            <p class="text-xs text-dimmed">PNG, JPG or SVG, up to 2 MB.</p>
          </section>

          <USeparator />

          <section class="space-y-2">
            <h2 class="text-sm font-semibold">Email domains</h2>
            <p class="text-xs text-muted">Users signing up on these domains join this customer automatically.</p>
            <div class="space-y-1">
              <div
                v-for="domain in domains"
                :key="domain"
                class="flex items-center justify-between rounded-md border border-default px-3 py-1.5"
              >
                <span class="text-sm font-mono">{{ domain }}</span>
                <UButton
                  variant="ghost"
                  color="error"
                  icon="i-lucide-x"
                  size="xs"
                  square
                  @click="removeDomain(domain)"
                />
              </div>
              <p v-if="!domains?.length" class="text-xs text-dimmed">No domains yet</p>
            </div>
            <form class="flex gap-2 pt-1" @submit.prevent="addDomain">
              <UInput v-model="newDomain" placeholder="acme.com" size="sm" class="flex-1" />
              <UButton type="submit" :loading="addingDomain" icon="i-lucide-plus" size="sm" square />
            </form>
          </section>

          <USeparator />

          <section class="space-y-2">
            <h2 class="text-sm font-semibold">Members</h2>
            <div v-if="!members?.length" class="text-xs text-dimmed">No users have joined yet.</div>
            <ul v-else class="space-y-2">
              <li v-for="m in members" :key="m.id" class="flex items-center gap-2">
                <UAvatar :alt="m.full_name ?? m.email ?? ''" :src="m.avatar_url ?? undefined" size="2xs" />
                <span class="text-sm truncate">{{ m.full_name ?? m.email }}</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
