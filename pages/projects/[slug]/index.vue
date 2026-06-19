<script setup lang="ts">
import type { Issue, IssuePriority, IssueStatus, IssueType, IssueWithPeople, Label, PersonRef, Project } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const route = useRoute()
const supabase = useSupabaseClient()
const toast = useToast()
const slug = computed(() => route.params.slug as string)

const { ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_TYPES, statusMap, priorityMap, typeMap } = useIssueMeta()

const { data: project } = await useAsyncData(`project-${slug.value}`, async () => {
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

const search = ref('')
const statusFilter = ref<IssueStatus[]>([])
const priorityFilter = ref<IssuePriority[]>([])
const typeFilter = ref<IssueType[]>([])
const assigneeFilter = ref<'all' | 'me' | 'unassigned'>('all')

const user = useSupabaseUser()

const { data: issues, refresh } = await useAsyncData(
  () => `issues-${project.value!.id}`,
  async () => {
    const { data } = await supabase
      .from('issues')
      .select('*, assignee:profiles!issues_assignee_id_fkey(id, full_name, email, avatar_url), reporter:profiles!issues_reporter_id_fkey(id, full_name, email, avatar_url), issue_labels(label:labels(*))')
      .eq('project_id', project.value!.id)
      .order('number', { ascending: false })
    return ((data ?? []) as any[]).map((i) => ({
      ...i,
      labels: (i.issue_labels ?? []).map((il: any) => il.label).filter(Boolean) as Label[],
    })) as IssueWithPeople[]
  },
  { watch: [() => project.value?.id] },
)

const { data: members } = await useAsyncData(`list-members-${project.value.id}`, async () => {
  const { data } = await supabase
    .from('project_members')
    .select('profile:profiles(id, full_name, email, avatar_url)')
    .eq('project_id', project.value!.id)
  return ((data ?? []).map((m: any) => m.profile).filter(Boolean)) as PersonRef[]
})

const filtered = computed(() => {
  return (issues.value ?? []).filter((issue) => {
    if (search.value && !issue.title.toLowerCase().includes(search.value.toLowerCase())) return false
    if (statusFilter.value.length && !statusFilter.value.includes(issue.status)) return false
    if (priorityFilter.value.length && !priorityFilter.value.includes(issue.priority)) return false
    if (typeFilter.value.length && !typeFilter.value.includes(issue.type)) return false
    if (assigneeFilter.value === 'me' && issue.assignee_id !== user.value?.id) return false
    if (assigneeFilter.value === 'unassigned' && issue.assignee_id) return false
    return true
  })
})

const statusItems = ISSUE_STATUSES.map((s) => ({ label: s.label, value: s.value, icon: s.icon }))
const priorityItems = ISSUE_PRIORITIES.map((p) => ({ label: p.label, value: p.value, icon: p.icon }))
const typeItems = ISSUE_TYPES.map((t) => ({ label: t.label, value: t.value, icon: t.icon }))
const assigneeFilterItems = [
  { label: 'All issues', value: 'all' },
  { label: 'Assigned to me', value: 'me' },
  { label: 'Unassigned', value: 'unassigned' },
]
const assigneeItems = computed(() => [
  { label: 'Unassigned', value: null },
  ...(members.value ?? []).map((m) => ({ label: m.full_name ?? m.email ?? 'Unknown', value: m.id })),
])

// ---- Inline editing ----------------------------------------------------
async function updateIssue(issue: IssueWithPeople, payload: Partial<Issue>) {
  const prev: Record<string, any> = {}
  for (const k of Object.keys(payload)) prev[k] = (issue as any)[k]
  Object.assign(issue, payload) // optimistic
  if ('assignee_id' in payload) {
    issue.assignee = (members.value ?? []).find((m) => m.id === payload.assignee_id) ?? null
  }
  const { error } = await supabase.from('issues').update(payload).eq('id', issue.id)
  if (error) {
    Object.assign(issue, prev) // revert
    toast.add({ title: 'Update failed', description: error.message, color: 'error' })
  }
}

const editingTitleId = ref<string | null>(null)
const titleDraft = ref('')
function startTitleEdit(issue: IssueWithPeople) {
  editingTitleId.value = issue.id
  titleDraft.value = issue.title
  nextTick(() => document.getElementById(`title-${issue.id}`)?.focus())
}
async function commitTitle(issue: IssueWithPeople) {
  const next = titleDraft.value.trim()
  editingTitleId.value = null
  if (next && next !== issue.title) await updateIssue(issue, { title: next })
}
</script>

<template>
  <UDashboardPanel id="issues">
    <template #header>
      <UDashboardNavbar :title="project!.name" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton :to="`/projects/${slug}/board`" variant="ghost" icon="i-lucide-kanban" label="Board" />
          <UButton :to="`/projects/${slug}/files`" variant="ghost" icon="i-lucide-folder" label="Files" />
          <UButton :to="`/projects/${slug}/issues/new`" icon="i-lucide-plus" label="New issue" color="primary" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput v-model="search" placeholder="Search issues..." icon="i-lucide-search" size="sm" />
          <USelectMenu v-model="statusFilter" :items="statusItems" value-key="value" multiple placeholder="Status" icon="i-lucide-circle" size="sm" />
          <USelectMenu v-model="priorityFilter" :items="priorityItems" value-key="value" multiple placeholder="Priority" icon="i-lucide-flag" size="sm" />
          <USelectMenu v-model="typeFilter" :items="typeItems" value-key="value" multiple placeholder="Type" icon="i-lucide-tag" size="sm" />
          <USelectMenu v-model="assigneeFilter" :items="assigneeFilterItems" value-key="value" size="sm" placeholder="Assignee" />
        </template>
        <template #right>
          <span class="text-xs text-muted">{{ filtered.length }} / {{ issues?.length ?? 0 }}</span>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="!issues?.length" class="p-12 text-center">
        <UIcon name="i-lucide-inbox" class="size-10 mx-auto mb-3 text-dimmed" />
        <h2 class="font-semibold mb-1">No issues yet</h2>
        <p class="text-sm text-muted mb-4">Get the ball rolling.</p>
        <UButton :to="`/projects/${slug}/issues/new`" label="Create issue" color="primary" />
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm border-separate border-spacing-0 min-w-[920px]">
          <thead class="sticky top-0 z-10 bg-default">
            <tr class="text-xs text-muted text-left">
              <th class="font-medium px-3 py-2 border-b border-default w-20">ID</th>
              <th class="font-medium px-2 py-2 border-b border-default w-36">Type</th>
              <th class="font-medium px-2 py-2 border-b border-default">Title</th>
              <th class="font-medium px-2 py-2 border-b border-default w-40">Status</th>
              <th class="font-medium px-2 py-2 border-b border-default w-36">Priority</th>
              <th class="font-medium px-2 py-2 border-b border-default w-44">Assignee</th>
              <th class="font-medium px-2 py-2 border-b border-default w-36">Due</th>
              <th class="font-medium px-2 py-2 border-b border-default w-10" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="issue in filtered" :key="issue.id" class="group hover:bg-elevated/40">
              <!-- ID -->
              <td class="px-3 py-1.5 border-b border-default align-middle">
                <span class="font-mono text-xs text-muted">{{ project!.key }}-{{ issue.number }}</span>
              </td>

              <!-- Type -->
              <td class="px-2 py-1.5 border-b border-default">
                <USelectMenu
                  :model-value="issue.type"
                  :items="typeItems"
                  value-key="value"
                  variant="none"
                  size="sm"
                  :ui="{ base: 'w-full px-1.5' }"
                  @update:model-value="(v: any) => updateIssue(issue, { type: v })"
                >
                  <template #default>
                    <span class="flex items-center gap-1.5">
                      <UIcon :name="typeMap[issue.type].icon" :class="`text-${typeMap[issue.type].color}`" class="size-4" />
                      {{ typeMap[issue.type].label }}
                    </span>
                  </template>
                </USelectMenu>
              </td>

              <!-- Title (inline editable) -->
              <td class="px-2 py-1.5 border-b border-default">
                <div class="flex items-center gap-2">
                  <UInput
                    v-if="editingTitleId === issue.id"
                    :id="`title-${issue.id}`"
                    v-model="titleDraft"
                    size="sm"
                    class="w-full"
                    @keydown.enter="commitTitle(issue)"
                    @keydown.esc="editingTitleId = null"
                    @blur="commitTitle(issue)"
                  />
                  <button
                    v-else
                    class="text-left w-full truncate rounded px-1.5 py-1 hover:bg-elevated cursor-text"
                    @click="startTitleEdit(issue)"
                  >
                    {{ issue.title }}
                  </button>
                  <div v-if="issue.labels?.length && editingTitleId !== issue.id" class="hidden lg:flex gap-1 shrink-0">
                    <UBadge v-for="l in issue.labels.slice(0, 2)" :key="l.id" size="sm" variant="subtle" :color="(l.color as any)" :label="l.name" />
                  </div>
                </div>
              </td>

              <!-- Status -->
              <td class="px-2 py-1.5 border-b border-default">
                <USelectMenu
                  :model-value="issue.status"
                  :items="statusItems"
                  value-key="value"
                  variant="none"
                  size="sm"
                  :ui="{ base: 'w-full px-1.5' }"
                  @update:model-value="(v: any) => updateIssue(issue, { status: v })"
                >
                  <template #default>
                    <span class="flex items-center gap-1.5">
                      <UIcon :name="statusMap[issue.status].icon" :class="`text-${statusMap[issue.status].color}`" class="size-4" />
                      {{ statusMap[issue.status].label }}
                    </span>
                  </template>
                </USelectMenu>
              </td>

              <!-- Priority -->
              <td class="px-2 py-1.5 border-b border-default">
                <USelectMenu
                  :model-value="issue.priority"
                  :items="priorityItems"
                  value-key="value"
                  variant="none"
                  size="sm"
                  :ui="{ base: 'w-full px-1.5' }"
                  @update:model-value="(v: any) => updateIssue(issue, { priority: v })"
                >
                  <template #default>
                    <UBadge variant="subtle" size="sm" :color="priorityMap[issue.priority].color" :label="priorityMap[issue.priority].label" />
                  </template>
                </USelectMenu>
              </td>

              <!-- Assignee -->
              <td class="px-2 py-1.5 border-b border-default">
                <USelectMenu
                  :model-value="issue.assignee_id"
                  :items="assigneeItems"
                  value-key="value"
                  variant="none"
                  size="sm"
                  :ui="{ base: 'w-full px-1.5' }"
                  @update:model-value="(v: any) => updateIssue(issue, { assignee_id: v })"
                >
                  <template #default>
                    <span class="flex items-center gap-1.5 truncate">
                      <UAvatar v-if="issue.assignee" :alt="issue.assignee.full_name ?? issue.assignee.email ?? ''" :src="issue.assignee.avatar_url ?? undefined" size="3xs" />
                      <UIcon v-else name="i-lucide-user" class="size-4 text-dimmed" />
                      <span class="truncate text-xs">{{ issue.assignee?.full_name ?? issue.assignee?.email ?? 'Unassigned' }}</span>
                    </span>
                  </template>
                </USelectMenu>
              </td>

              <!-- Due date -->
              <td class="px-2 py-1.5 border-b border-default">
                <UInput
                  :model-value="issue.due_date ?? ''"
                  type="date"
                  size="sm"
                  variant="none"
                  :ui="{ base: 'w-full px-1' }"
                  @change="(e: any) => updateIssue(issue, { due_date: e.target.value || null })"
                />
              </td>

              <!-- Open detail -->
              <td class="px-2 py-1.5 border-b border-default text-right">
                <UButton
                  :to="`/projects/${slug}/issues/${issue.number}`"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-maximize-2"
                  size="xs"
                  square
                  class="opacity-0 group-hover:opacity-100"
                />
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="8" class="p-8 text-center text-sm text-muted">No issues match these filters.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </UDashboardPanel>
</template>
