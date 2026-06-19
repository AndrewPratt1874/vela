<script setup lang="ts">
import type { Issue, IssuePriority, IssueStatus, IssueType, IssueWithPeople, Label, Project } from '~/types/database'

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

// Assignable to anyone on the project plus all approved staff.
const { assignees: members } = await useProjectAssignees(project.value.id)

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

// ---- Click-to-sort (preference persisted in a cookie, SSR-safe) ----------
type SortKey = 'number' | 'type' | 'title' | 'status' | 'priority' | 'assignee' | 'due'
const sortPref = useCookie<{ key: SortKey, dir: 'asc' | 'desc' }>('vela-issues-sort', {
  default: () => ({ key: 'number', dir: 'desc' }),
  sameSite: 'lax',
})
function toggleSort(key: SortKey) {
  const { key: curKey, dir } = sortPref.value
  sortPref.value = curKey === key
    ? { key, dir: dir === 'asc' ? 'desc' : 'asc' }
    // Number newest-first; everything else (incl. due = soonest) ascending first.
    : { key, dir: key === 'number' ? 'desc' : 'asc' }
}
const sortIcon = (key: SortKey) =>
  sortPref.value.key !== key ? 'i-lucide-chevrons-up-down' : sortPref.value.dir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'

const typeRank = Object.fromEntries(ISSUE_TYPES.map((t, i) => [t.value, i]))
const statusRank = Object.fromEntries(ISSUE_STATUSES.map((s, i) => [s.value, i]))
const priorityRank = Object.fromEntries(ISSUE_PRIORITIES.map((p, i) => [p.value, i]))

const sorted = computed(() => {
  const dir = sortPref.value.dir === 'asc' ? 1 : -1
  const val = (i: IssueWithPeople): string | number => {
    switch (sortPref.value.key) {
      case 'number': return i.number
      case 'type': return typeRank[i.type]
      case 'title': return i.title.toLowerCase()
      case 'status': return statusRank[i.status]
      case 'priority': return priorityRank[i.priority]
      case 'assignee': return (i.assignee?.full_name ?? i.assignee?.email ?? '').toLowerCase()
      case 'due': return i.due_date ?? '￿' // undated sort last when ascending
    }
  }
  return [...filtered.value].sort((a, b) => {
    const av = val(a), bv = val(b)
    return av < bv ? -dir : av > bv ? dir : 0
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

// ---- Inline add (quick-add row) ----------------------------------------
const adding = ref(false)
const draft = reactive({
  title: '',
  type: 'task' as IssueType,
  status: 'todo' as IssueStatus,
  priority: 'medium' as IssuePriority,
  assignee_id: null as string | null,
  due_date: null as string | null,
})
async function addIssue() {
  const title = draft.title.trim()
  if (!title || adding.value || !user.value || !project.value) return
  adding.value = true
  const { error } = await supabase.from('issues').insert({
    project_id: project.value.id,
    title,
    type: draft.type,
    status: draft.status,
    priority: draft.priority,
    assignee_id: draft.assignee_id,
    due_date: draft.due_date || null,
    reporter_id: user.value.id,
  })
  adding.value = false
  if (error) {
    toast.add({ title: 'Could not add issue', description: error.message, color: 'error' })
    return
  }
  // Keep type/status/priority/assignee for fast repeat entry; clear the rest.
  draft.title = ''
  draft.due_date = null
  await refresh()
  nextTick(() => document.getElementById('quick-add-title')?.focus())
}
const draftAssignee = computed(() => (members.value ?? []).find((m) => m.id === draft.assignee_id) ?? null)

// Delete an issue (RLS: anyone with project access). Cascades to comments etc.
async function deleteIssue(issue: IssueWithPeople) {
  if (!confirm(`Delete ${project.value!.key}-${issue.number}? This can't be undone.`)) return
  const { error } = await supabase.from('issues').delete().eq('id', issue.id)
  if (error) {
    toast.add({ title: 'Delete failed', description: error.message, color: 'error' })
    return
  }
  issues.value = (issues.value ?? []).filter((i) => i.id !== issue.id)
  toast.add({ title: `${project.value!.key}-${issue.number} deleted`, color: 'success' })
}
const rowMenu = (issue: IssueWithPeople) => [[
  { label: 'Open', icon: 'i-lucide-maximize-2', to: `/projects/${slug.value}/issues/${issue.number}` },
  { label: 'Delete issue', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteIssue(issue) },
]]
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
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-separate border-spacing-0 min-w-[920px]">
          <thead class="sticky top-0 z-10 bg-default">
            <tr class="text-xs text-muted text-left">
              <th class="font-medium px-3 py-2 border-b border-default w-20">
                <button type="button" class="flex items-center gap-1 hover:text-default" @click="toggleSort('number')">ID<UIcon :name="sortIcon('number')" class="size-3" /></button>
              </th>
              <th class="font-medium px-2 py-2 border-b border-default w-36">
                <button type="button" class="flex items-center gap-1 hover:text-default" @click="toggleSort('type')">Type<UIcon :name="sortIcon('type')" class="size-3" /></button>
              </th>
              <th class="font-medium px-2 py-2 border-b border-default">
                <button type="button" class="flex items-center gap-1 hover:text-default" @click="toggleSort('title')">Title<UIcon :name="sortIcon('title')" class="size-3" /></button>
              </th>
              <th class="font-medium px-2 py-2 border-b border-default w-40">
                <button type="button" class="flex items-center gap-1 hover:text-default" @click="toggleSort('status')">Status<UIcon :name="sortIcon('status')" class="size-3" /></button>
              </th>
              <th class="font-medium px-2 py-2 border-b border-default w-36">
                <button type="button" class="flex items-center gap-1 hover:text-default" @click="toggleSort('priority')">Priority<UIcon :name="sortIcon('priority')" class="size-3" /></button>
              </th>
              <th class="font-medium px-2 py-2 border-b border-default w-44">
                <button type="button" class="flex items-center gap-1 hover:text-default" @click="toggleSort('assignee')">Assignee<UIcon :name="sortIcon('assignee')" class="size-3" /></button>
              </th>
              <th class="font-medium px-2 py-2 border-b border-default w-36">
                <button type="button" class="flex items-center gap-1 hover:text-default" @click="toggleSort('due')">Due<UIcon :name="sortIcon('due')" class="size-3" /></button>
              </th>
              <th class="font-medium px-2 py-2 border-b border-default w-10" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="issue in sorted" :key="issue.id" class="group hover:bg-elevated/40">
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

              <!-- Row actions -->
              <td class="px-2 py-1.5 border-b border-default text-right">
                <UDropdownMenu :items="rowMenu(issue)" :content="{ align: 'end' }">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-ellipsis"
                    size="xs"
                    square
                    class="opacity-0 group-hover:opacity-100"
                  />
                </UDropdownMenu>
              </td>
            </tr>
            <tr v-if="!sorted.length">
              <td colspan="8" class="p-8 text-center text-sm text-muted">
                {{ issues?.length ? 'No issues match these filters.' : 'No issues yet — add your first below.' }}
              </td>
            </tr>

            <!-- Quick add row -->
            <tr class="bg-elevated/30">
              <td class="px-3 py-1.5 border-b border-default text-center">
                <UIcon name="i-lucide-plus" class="size-4 text-muted" />
              </td>
              <td class="px-2 py-1.5 border-b border-default">
                <USelectMenu
                  :model-value="draft.type"
                  :items="typeItems"
                  value-key="value"
                  variant="none"
                  size="sm"
                  :ui="{ base: 'w-full px-1.5' }"
                  @update:model-value="(v: any) => draft.type = v"
                >
                  <template #default>
                    <span class="flex items-center gap-1.5">
                      <UIcon :name="typeMap[draft.type].icon" :class="`text-${typeMap[draft.type].color}`" class="size-4" />
                      {{ typeMap[draft.type].label }}
                    </span>
                  </template>
                </USelectMenu>
              </td>
              <td class="px-2 py-1.5 border-b border-default">
                <UInput
                  id="quick-add-title"
                  v-model="draft.title"
                  size="sm"
                  class="w-full"
                  placeholder="Add an issue and press Enter…"
                  :disabled="adding"
                  @keydown.enter="addIssue"
                />
              </td>
              <td class="px-2 py-1.5 border-b border-default">
                <USelectMenu
                  :model-value="draft.status"
                  :items="statusItems"
                  value-key="value"
                  variant="none"
                  size="sm"
                  :ui="{ base: 'w-full px-1.5' }"
                  @update:model-value="(v: any) => draft.status = v"
                >
                  <template #default>
                    <span class="flex items-center gap-1.5">
                      <UIcon :name="statusMap[draft.status].icon" :class="`text-${statusMap[draft.status].color}`" class="size-4" />
                      {{ statusMap[draft.status].label }}
                    </span>
                  </template>
                </USelectMenu>
              </td>
              <td class="px-2 py-1.5 border-b border-default">
                <USelectMenu
                  :model-value="draft.priority"
                  :items="priorityItems"
                  value-key="value"
                  variant="none"
                  size="sm"
                  :ui="{ base: 'w-full px-1.5' }"
                  @update:model-value="(v: any) => draft.priority = v"
                >
                  <template #default>
                    <UBadge variant="subtle" size="sm" :color="priorityMap[draft.priority].color" :label="priorityMap[draft.priority].label" />
                  </template>
                </USelectMenu>
              </td>
              <td class="px-2 py-1.5 border-b border-default">
                <USelectMenu
                  :model-value="draft.assignee_id"
                  :items="assigneeItems"
                  value-key="value"
                  variant="none"
                  size="sm"
                  :ui="{ base: 'w-full px-1.5' }"
                  @update:model-value="(v: any) => draft.assignee_id = v"
                >
                  <template #default>
                    <span class="flex items-center gap-1.5 truncate">
                      <UAvatar v-if="draftAssignee" :alt="draftAssignee.full_name ?? draftAssignee.email ?? ''" :src="draftAssignee.avatar_url ?? undefined" size="3xs" />
                      <UIcon v-else name="i-lucide-user" class="size-4 text-dimmed" />
                      <span class="truncate text-xs">{{ draftAssignee?.full_name ?? draftAssignee?.email ?? 'Unassigned' }}</span>
                    </span>
                  </template>
                </USelectMenu>
              </td>
              <td class="px-2 py-1.5 border-b border-default">
                <UInput
                  :model-value="draft.due_date ?? ''"
                  type="date"
                  size="sm"
                  variant="none"
                  :ui="{ base: 'w-full px-1' }"
                  @change="(e: any) => draft.due_date = e.target.value || null"
                />
              </td>
              <td class="px-2 py-1.5 border-b border-default text-right">
                <UButton
                  icon="i-lucide-corner-down-left"
                  size="xs"
                  square
                  color="primary"
                  variant="soft"
                  :loading="adding"
                  :disabled="!draft.title.trim()"
                  @click="addIssue"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </UDashboardPanel>
</template>
