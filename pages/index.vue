<script setup lang="ts">
import type { IssueWithPeople, Project } from '~/types/database'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { statusMap, priorityMap } = useIssueMeta()

// Customer users get the portal, not the staff overview.
const { isStaff, pending: profilePending } = useCurrentProfile()
watchEffect(() => {
  if (!profilePending.value && user.value && !isStaff.value) {
    navigateTo('/portal')
  }
})

const { data: projects } = await useAsyncData('overview-projects', async () => {
  const { data } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(6)
  return (data ?? []) as Project[]
})

const { data: myIssues } = await useAsyncData('overview-my-issues', async () => {
  if (!user.value) return []
  const { data } = await supabase
    .from('issues')
    .select('*, project:projects(name, slug, key), assignee:profiles!issues_assignee_id_fkey(id, full_name, email, avatar_url), reporter:profiles!issues_reporter_id_fkey(id, full_name, email, avatar_url)')
    .eq('assignee_id', user.value.id)
    .neq('status', 'done')
    .neq('status', 'cancelled')
    .order('updated_at', { ascending: false })
    .limit(10)
  return (data ?? []) as Array<IssueWithPeople & { project: { name: string, slug: string, key: string } }>
})
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton to="/projects/new" icon="i-lucide-plus" label="New project" color="primary" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 space-y-8">
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-semibold">Your open issues</h2>
            <UBadge variant="subtle" :label="`${myIssues?.length ?? 0}`" />
          </div>
          <UCard v-if="!myIssues?.length" :ui="{ body: 'text-center text-sm text-muted py-10' }">
            <UIcon name="i-lucide-inbox" class="size-8 mx-auto mb-2 text-dimmed" />
            <p>Nothing assigned to you. Enjoy the calm.</p>
          </UCard>
          <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
            <ul class="divide-y divide-default">
              <li v-for="issue in myIssues" :key="issue.id">
                <NuxtLink
                  :to="`/projects/${issue.project.slug}/issues/${issue.number}`"
                  class="flex items-center gap-3 px-4 py-3 hover:bg-elevated/50"
                >
                  <UIcon
                    :name="statusMap[issue.status].icon"
                    :class="`text-${statusMap[issue.status].color}`"
                    class="size-4 shrink-0"
                  />
                  <span class="text-xs text-muted font-mono shrink-0">
                    {{ issue.project.key }}-{{ issue.number }}
                  </span>
                  <span class="text-sm flex-1 truncate">{{ issue.title }}</span>
                  <UBadge
                    variant="subtle"
                    :color="priorityMap[issue.priority].color"
                    :label="priorityMap[issue.priority].label"
                    size="sm"
                  />
                </NuxtLink>
              </li>
            </ul>
          </UCard>
        </section>

        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-semibold">Projects</h2>
            <UButton to="/projects" variant="link" trailing-icon="i-lucide-arrow-right" label="View all" />
          </div>
          <div v-if="!projects?.length" class="rounded-lg border border-dashed border-default p-10 text-center">
            <UIcon name="i-lucide-folder-plus" class="size-8 mx-auto mb-2 text-dimmed" />
            <p class="text-sm text-muted mb-3">No projects yet</p>
            <UButton to="/projects/new" label="Create your first project" color="primary" />
          </div>
          <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
              v-for="project in projects"
              :key="project.id"
              :to="`/projects/${project.slug}`"
              class="block"
            >
              <UCard class="hover:border-primary transition" :ui="{ body: 'space-y-1' }">
                <div class="flex items-center justify-between">
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
