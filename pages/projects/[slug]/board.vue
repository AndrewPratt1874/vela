<script setup lang="ts">
import type { IssueStatus, IssueWithPeople, Label, Project } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const route = useRoute()
const supabase = useSupabaseClient()
const toast = useToast()
const slug = computed(() => route.params.slug as string)

const { ISSUE_STATUSES, statusMap, priorityMap, typeMap } = useIssueMeta()

const { data: project } = await useAsyncData(`board-project-${slug.value}`, async () => {
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug.value)
    .single()
  return data as Project | null
}, { watch: [slug] })

if (!project.value) {
  throw createError({ statusCode: 404, statusMessage: 'Project not found' })
}

const { data: issues, refresh } = await useAsyncData(
  () => `board-issues-${project.value!.id}`,
  async () => {
    const { data } = await supabase
      .from('issues')
      .select('*, assignee:profiles!issues_assignee_id_fkey(id, full_name, email, avatar_url), reporter:profiles!issues_reporter_id_fkey(id, full_name, email, avatar_url), issue_labels(label:labels(*))')
      .eq('project_id', project.value!.id)
      .order('updated_at', { ascending: false })
    return ((data ?? []) as any[]).map((i) => ({
      ...i,
      labels: (i.issue_labels ?? []).map((il: any) => il.label).filter(Boolean) as Label[],
    })) as IssueWithPeople[]
  },
  { watch: [() => project.value?.id] },
)

const columns = computed(() =>
  ISSUE_STATUSES.map((status) => ({
    ...status,
    issues: (issues.value ?? []).filter((i) => i.status === status.value),
  })),
)

const dragId = ref<string | null>(null)

function onDragStart(issueId: string) {
  dragId.value = issueId
}

async function onDrop(status: IssueStatus) {
  const id = dragId.value
  dragId.value = null
  if (!id) return
  const issue = issues.value?.find((i) => i.id === id)
  if (!issue || issue.status === status) return

  // optimistic update
  const previous = issue.status
  issue.status = status

  const { error } = await supabase.from('issues').update({ status }).eq('id', id)
  if (error) {
    issue.status = previous
    toast.add({ title: 'Could not move issue', description: error.message, color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="board">
    <template #header>
      <UDashboardNavbar :title="`${project!.name} — Board`" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton :to="`/projects/${slug}`" variant="ghost" icon="i-lucide-list" label="List" />
          <UButton :to="`/projects/${slug}/files`" variant="ghost" icon="i-lucide-folder" label="Files" />
          <UButton :to="`/projects/${slug}/issues/new`" icon="i-lucide-plus" label="New issue" color="primary" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex gap-4 p-4 lg:p-6 overflow-x-auto h-full">
        <div
          v-for="col in columns"
          :key="col.value"
          class="flex flex-col w-72 shrink-0 rounded-lg border border-default bg-elevated/25"
          @dragover.prevent
          @drop="onDrop(col.value)"
        >
          <div class="flex items-center gap-2 px-3 py-2 border-b border-default">
            <UIcon :name="col.icon" :class="`text-${col.color}`" class="size-4" />
            <span class="text-sm font-medium">{{ col.label }}</span>
            <UBadge variant="subtle" size="sm" :label="`${col.issues.length}`" class="ml-auto" />
          </div>

          <div class="flex-1 p-2 space-y-2 overflow-y-auto min-h-24">
            <NuxtLink
              v-for="issue in col.issues"
              :key="issue.id"
              :to="`/projects/${slug}/issues/${issue.number}`"
              :draggable="true"
              class="block rounded-md bg-default border border-default p-3 cursor-grab active:cursor-grabbing hover:border-primary transition"
              @dragstart="onDragStart(issue.id)"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="flex items-center gap-1.5 text-xs text-muted font-mono">
                  <UIcon
                    :name="typeMap[issue.type].icon"
                    :class="`text-${typeMap[issue.type].color}`"
                    class="size-3.5"
                  />
                  {{ project!.key }}-{{ issue.number }}
                </span>
                <UBadge
                  variant="subtle"
                  size="sm"
                  :color="priorityMap[issue.priority].color"
                  :label="priorityMap[issue.priority].label"
                />
              </div>
              <p class="text-sm">{{ issue.title }}</p>
              <div v-if="issue.labels?.length" class="flex flex-wrap gap-1 mt-2">
                <UBadge
                  v-for="l in issue.labels"
                  :key="l.id"
                  size="sm"
                  variant="subtle"
                  :color="(l.color as any)"
                  :label="l.name"
                />
              </div>
              <div v-if="issue.assignee" class="flex items-center gap-2 mt-2">
                <UAvatar
                  :alt="issue.assignee.full_name ?? issue.assignee.email ?? ''"
                  :src="issue.assignee.avatar_url ?? undefined"
                  size="3xs"
                />
                <span class="text-xs text-muted truncate">
                  {{ issue.assignee.full_name ?? issue.assignee.email }}
                </span>
              </div>
            </NuxtLink>
            <p v-if="!col.issues.length" class="text-xs text-dimmed text-center py-4">
              Drop here
            </p>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
