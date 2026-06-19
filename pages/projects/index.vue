<script setup lang="ts">
import type { Project } from '~/types/database'

const supabase = useSupabaseClient()

type ProjectRow = Project & { customer: { name: string, slug: string, logo_url: string | null } | null }

const { data: projects, refresh } = await useAsyncData('projects-list', async () => {
  const { data } = await supabase
    .from('projects')
    .select('*, customer:customers(name, slug, logo_url)')
    .order('created_at', { ascending: false })
  return (data ?? []) as ProjectRow[]
})

const search = ref('')
const customerFilter = ref<string | null>(null) // null = all, '__none__' = unassigned

const customerOptions = computed(() => {
  const byName = new Map<string, string>() // slug -> name
  let hasNone = false
  for (const p of projects.value ?? []) {
    if (p.customer) byName.set(p.customer.slug, p.customer.name)
    else hasNone = true
  }
  const opts: Array<{ label: string, value: string | null }> = [{ label: 'All customers', value: null }]
  for (const [slug, name] of [...byName].sort((a, b) => a[1].localeCompare(b[1]))) {
    opts.push({ label: name, value: slug })
  }
  if (hasNone) opts.push({ label: 'No customer', value: '__none__' })
  return opts
})

const filteredProjects = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (projects.value ?? []).filter((p) => {
    if (customerFilter.value === '__none__' && p.customer) return false
    if (customerFilter.value && customerFilter.value !== '__none__' && p.customer?.slug !== customerFilter.value) return false
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q)
      || p.key.toLowerCase().includes(q)
      || (p.description?.toLowerCase().includes(q) ?? false)
    )
  })
})
</script>

<template>
  <UDashboardPanel id="projects">
    <template #header>
      <UDashboardNavbar title="Projects" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton to="/projects/new" icon="i-lucide-plus" label="New project" color="primary" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6">
        <div v-if="!projects?.length" class="rounded-lg border border-dashed border-default p-12 text-center">
          <UIcon name="i-lucide-folder-plus" class="size-10 mx-auto mb-3 text-dimmed" />
          <h2 class="font-semibold mb-1">No projects yet</h2>
          <p class="text-sm text-muted mb-4">Create your first project to start tracking issues.</p>
          <UButton to="/projects/new" label="Create project" color="primary" />
        </div>

        <template v-else>
          <div class="flex flex-col sm:flex-row gap-2 mb-4">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Search projects…"
              class="flex-1"
            >
              <template v-if="search" #trailing>
                <UButton
                  variant="link"
                  color="neutral"
                  icon="i-lucide-x"
                  :padded="false"
                  aria-label="Clear search"
                  @click="search = ''"
                />
              </template>
            </UInput>
            <USelectMenu
              v-model="customerFilter"
              :items="customerOptions"
              value-key="value"
              icon="i-lucide-building-2"
              class="sm:w-56"
            />
          </div>

          <div v-if="filteredProjects.length" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
              v-for="project in filteredProjects"
              :key="project.id"
              :to="`/projects/${project.slug}`"
              class="block"
            >
              <UCard class="hover:border-primary transition h-full">
                <div class="flex items-start justify-between mb-1">
                  <span class="font-medium">{{ project.name }}</span>
                  <UBadge variant="outline" size="sm" :label="project.key" />
                </div>
                <div class="flex items-center gap-1.5 text-sm text-muted mb-2">
                  <CustomerLogo :name="project.customer?.name ?? 'No customer'" :src="project.customer?.logo_url" size="3xs" />
                  <span class="truncate">{{ project.customer?.name ?? 'No customer' }}</span>
                </div>
                <p v-if="project.description" class="text-sm text-muted line-clamp-3">
                  {{ project.description }}
                </p>
                <p v-else class="text-sm text-dimmed italic">No description</p>
              </UCard>
            </NuxtLink>
          </div>

          <div v-else class="rounded-lg border border-dashed border-default p-12 text-center">
            <UIcon name="i-lucide-search-x" class="size-10 mx-auto mb-3 text-dimmed" />
            <h2 class="font-semibold mb-1">No matching projects</h2>
            <p class="text-sm text-muted">Try a different search or customer filter.</p>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
