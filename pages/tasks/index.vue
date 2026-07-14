<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { formatDistanceToNow } from 'date-fns'
import type { Issue, IssuePriority, IssueStatus, IssueType, PersonRef, Project } from '~/types/database'

// Staff-only cross-project work queue: every active (non-done, non-cancelled)
// issue across all projects, so admins see everything still needing action in
// one place. Per-project boards/lists remain the place to see completed work.
definePageMeta({ middleware: 'staff' })

const supabase = useSupabaseClient()
const toast = useToast()
const user = useSupabaseUser()
const { ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_TYPES, statusMap, priorityMap, typeMap } = useIssueMeta()

// The active statuses this view covers (everything except the terminal ones).
const ACTIVE_STATUSES = ISSUE_STATUSES.filter((s) => !['done', 'cancelled'].includes(s.value))

type Row = Issue & {
  project: Pick<Project, 'id' | 'name' | 'slug' | 'key'> | null
  assignee: PersonRef | null
}

const { data: issues } = await useAsyncData('active-tasks', async () => {
  const { data } = await supabase
    .from('issues')
    .select('*, project:projects!inner(id, name, slug, key, archived_at), assignee:profiles!issues_assignee_id_fkey(id, full_name, email, avatar_url)')
    // Only work that still needs doing — terminal states are excluded
    // server-side, and archived projects drop out of the queue entirely.
    .is('project.archived_at', null)
    .not('status', 'in', '(done,cancelled)')
    .order('updated_at', { ascending: false })
  return (data ?? []) as Row[]
})

const search = ref('')
// Filter on the settled value, not every keystroke — re-rendering rows full of
// popover menus synchronously per keypress blocked paint (INP).
const debouncedSearch = refDebounced(search, 150)
const projectFilter = ref<string[]>([])
const statusFilter = ref<IssueStatus[]>([])
const priorityFilter = ref<IssuePriority[]>([])
const typeFilter = ref<IssueType[]>([])
const assigneeFilter = ref<'all' | 'me' | 'unassigned'>('all')

// Only projects that actually have active tasks — keeps the filter list tight.
const projectItems = computed(() => {
  const byId = new Map<string, string>()
  for (const i of issues.value ?? []) {
    if (i.project) byId.set(i.project.id, i.project.name)
  }
  return [...byId].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ label, value }))
})
const statusItems = ACTIVE_STATUSES.map((s) => ({ label: s.label, value: s.value, icon: s.icon }))
const priorityItems = ISSUE_PRIORITIES.map((p) => ({ label: p.label, value: p.value, icon: p.icon }))
const typeItems = ISSUE_TYPES.map((t) => ({ label: t.label, value: t.value, icon: t.icon }))
const assigneeFilterItems = [
  { label: 'All assignees', value: 'all' },
  { label: 'Assigned to me', value: 'me' },
  { label: 'Unassigned', value: 'unassigned' },
]

const filtered = computed(() =>
  (issues.value ?? []).filter((i) => {
    if (projectFilter.value.length && !(i.project && projectFilter.value.includes(i.project.id))) return false
    if (statusFilter.value.length && !statusFilter.value.includes(i.status)) return false
    if (priorityFilter.value.length && !priorityFilter.value.includes(i.priority)) return false
    if (typeFilter.value.length && !typeFilter.value.includes(i.type)) return false
    if (assigneeFilter.value === 'me' && i.assignee_id !== user.value?.id) return false
    if (assigneeFilter.value === 'unassigned' && i.assignee_id) return false
    if (debouncedSearch.value) {
      const q = debouncedSearch.value.toLowerCase()
      const id = i.project ? `${i.project.key}-${i.number}`.toLowerCase() : String(i.number)
      if (!i.title.toLowerCase().includes(q) && !id.includes(q)) return false
    }
    return true
  }),
)

// Click-to-sort. Priority/status/type sort by their meaningful order, not
// alphabetically. Preference persisted in a cookie (SSR-safe: no flash).
type SortKey = 'id' | 'title' | 'project' | 'priority' | 'status' | 'assignee' | 'due' | 'updated'
const sortPref = useCookie<{ key: SortKey, dir: 'asc' | 'desc' }>('vela-tasks-sort', {
  default: () => ({ key: 'updated', dir: 'desc' }),
  sameSite: 'lax',
})
function toggleSort(key: SortKey) {
  const { key: curKey, dir } = sortPref.value
  sortPref.value = curKey === key
    ? { key, dir: dir === 'asc' ? 'desc' : 'asc' }
    // Recency newest-first; everything else (incl. due = soonest) ascending first.
    : { key, dir: key === 'updated' ? 'desc' : 'asc' }
}
const sortIcon = (key: SortKey) =>
  sortPref.value.key !== key ? 'i-lucide-chevrons-up-down' : sortPref.value.dir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'

const priorityRank = Object.fromEntries(ISSUE_PRIORITIES.map((p, i) => [p.value, i]))
const statusRank = Object.fromEntries(ISSUE_STATUSES.map((s, i) => [s.value, i]))

const sorted = computed(() => {
  const dir = sortPref.value.dir === 'asc' ? 1 : -1
  const val = (i: Row): string | number => {
    switch (sortPref.value.key) {
      case 'id': return i.project ? `${i.project.key}-${String(i.number).padStart(6, '0')}` : String(i.number)
      case 'title': return i.title.toLowerCase()
      case 'project': return i.project?.name?.toLowerCase() ?? '￿'
      case 'priority': return priorityRank[i.priority]
      case 'status': return statusRank[i.status]
      case 'assignee': return (i.assignee?.full_name ?? i.assignee?.email ?? '').toLowerCase()
      case 'due': return i.due_date ?? '￿' // undated sort last when ascending
      case 'updated': return i.updated_at
    }
  }
  return [...filtered.value].sort((a, b) => {
    const av = val(a), bv = val(b)
    return av < bv ? -dir : av > bv ? dir : 0
  })
})

// Paginate the rendered rows (each carries inline-edit menus, so rendering the
// full set at once janks navigation). Filtering/sorting run over everything.
const PAGE_SIZE = 25
const page = ref(1)
const paged = computed(() => sorted.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch([projectFilter, statusFilter, priorityFilter, typeFilter, assigneeFilter, debouncedSearch, sortPref], () => { page.value = 1 })
watch(() => sorted.value.length, (n) => {
  const last = Math.max(1, Math.ceil(n / PAGE_SIZE))
  if (page.value > last) page.value = last
})

function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

// Inline triage. Marking an issue done/cancelled drops it from this active-only
// view, so remove it locally on success rather than leaving a stale row.
async function setField<K extends 'status' | 'priority'>(i: Row, key: K, value: Row[K]) {
  if (i[key] === value) return
  const prev = i[key]
  i[key] = value
  const { error } = await supabase.from('issues').update({ [key]: value } as Partial<Issue>).eq('id', i.id)
  if (error) {
    i[key] = prev
    toast.add({ title: 'Update failed', description: error.message, color: 'error' })
    return
  }
  if (key === 'status' && (value === 'done' || value === 'cancelled')) {
    issues.value = (issues.value ?? []).filter((x) => x.id !== i.id)
  }
}

const statusMenu = (i: Row) => [ISSUE_STATUSES.map((s) => ({
  label: s.label, icon: s.icon, onSelect: () => setField(i, 'status', s.value),
}))]
const priorityMenu = (i: Row) => [ISSUE_PRIORITIES.map((p) => ({
  label: p.label, icon: p.icon, onSelect: () => setField(i, 'priority', p.value),
}))]

const issueLink = (i: Row) => i.project ? `/projects/${i.project.slug}/issues/${i.number}` : '#'
</script>

<template>
  <UDashboardPanel id="active-tasks">
    <template #header>
      <UDashboardNavbar title="Tasks" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput v-model="search" placeholder="Search tasks..." icon="i-lucide-search" size="sm" />
          <USelectMenu
            v-model="projectFilter"
            :items="projectItems"
            value-key="value"
            multiple
            placeholder="Project"
            icon="i-lucide-folder-kanban"
            size="sm"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            multiple
            placeholder="Status"
            icon="i-lucide-circle"
            size="sm"
          />
          <USelectMenu
            v-model="priorityFilter"
            :items="priorityItems"
            value-key="value"
            multiple
            placeholder="Priority"
            icon="i-lucide-flag"
            size="sm"
          />
          <USelectMenu
            v-model="typeFilter"
            :items="typeItems"
            value-key="value"
            multiple
            placeholder="Type"
            icon="i-lucide-tag"
            size="sm"
          />
          <USelectMenu v-model="assigneeFilter" :items="assigneeFilterItems" value-key="value" size="sm" placeholder="Assignee" />
        </template>
        <template #right>
          <span class="text-xs text-muted">{{ filtered.length }} / {{ issues?.length ?? 0 }}</span>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="!issues?.length" class="p-12 text-center">
        <UIcon name="i-lucide-check-check" class="size-10 mx-auto mb-3 text-dimmed" />
        <h2 class="font-semibold mb-1">Nothing outstanding</h2>
        <p class="text-sm text-muted">Every project task is done or cancelled.</p>
      </div>

      <div v-else>
        <!-- Column headers (click to sort) -->
        <div class="flex items-center gap-3 px-4 py-2 border-b border-default bg-elevated/30 text-xs font-medium uppercase tracking-wide text-muted">
          <span class="w-4 shrink-0" />
          <button type="button" class="w-20 shrink-0 flex items-center gap-1 hover:text-default" @click="toggleSort('id')">ID<UIcon :name="sortIcon('id')" class="size-3" /></button>
          <button type="button" class="flex-1 min-w-0 flex items-center gap-1 hover:text-default" @click="toggleSort('title')">Title<UIcon :name="sortIcon('title')" class="size-3" /></button>
          <button type="button" class="w-40 shrink-0 hidden lg:flex items-center gap-1 hover:text-default" @click="toggleSort('project')">Project<UIcon :name="sortIcon('project')" class="size-3" /></button>
          <button type="button" class="w-24 shrink-0 hidden sm:flex items-center gap-1 hover:text-default" @click="toggleSort('priority')">Priority<UIcon :name="sortIcon('priority')" class="size-3" /></button>
          <button type="button" class="w-36 shrink-0 hidden sm:flex items-center gap-1 hover:text-default" @click="toggleSort('status')">Status<UIcon :name="sortIcon('status')" class="size-3" /></button>
          <button type="button" class="w-8 shrink-0 hidden sm:flex items-center gap-1 justify-center hover:text-default" @click="toggleSort('assignee')"><UIcon :name="sortIcon('assignee')" class="size-3" /></button>
          <button type="button" class="w-24 shrink-0 hidden xl:flex items-center gap-1 hover:text-default" @click="toggleSort('due')">Due<UIcon :name="sortIcon('due')" class="size-3" /></button>
          <button type="button" class="w-24 shrink-0 hidden xl:flex items-center gap-1 hover:text-default" @click="toggleSort('updated')">Updated<UIcon :name="sortIcon('updated')" class="size-3" /></button>
          <span class="w-8 shrink-0" />
        </div>

        <ul class="divide-y divide-default">
          <li v-for="i in paged" :key="i.id" class="group flex items-center gap-3 px-4 py-3 hover:bg-elevated/50">
            <UIcon :name="typeMap[i.type].icon" :class="`text-${typeMap[i.type].color}`" class="size-4 shrink-0" />
            <NuxtLink :to="issueLink(i)" class="text-xs text-muted font-mono shrink-0 w-20 truncate hover:underline">{{ i.project ? `${i.project.key}-${i.number}` : `#${i.number}` }}</NuxtLink>
            <NuxtLink :to="issueLink(i)" class="text-sm flex-1 min-w-0 truncate hover:underline">{{ i.title }}</NuxtLink>
            <span class="w-40 shrink-0 hidden lg:flex min-w-0">
              <NuxtLink v-if="i.project" :to="`/projects/${i.project.slug}`" class="max-w-full">
                <UBadge variant="outline" color="neutral" size="sm" :label="i.project.name" class="max-w-full truncate" />
              </NuxtLink>
            </span>
            <span class="w-24 shrink-0 hidden sm:flex">
              <UDropdownMenu :items="priorityMenu(i)" :content="{ align: 'start' }">
                <UBadge variant="subtle" :color="priorityMap[i.priority].color" :label="priorityMap[i.priority].label" size="sm" class="cursor-pointer" />
              </UDropdownMenu>
            </span>
            <span class="w-36 shrink-0 hidden sm:flex">
              <UDropdownMenu :items="statusMenu(i)" :content="{ align: 'start' }">
                <UBadge variant="subtle" :color="statusMap[i.status].color" :icon="statusMap[i.status].icon" :label="statusMap[i.status].label" size="sm" class="cursor-pointer" />
              </UDropdownMenu>
            </span>
            <span class="w-8 shrink-0 hidden sm:flex justify-center">
              <UAvatar
                v-if="i.assignee"
                :alt="i.assignee.full_name ?? i.assignee.email ?? ''"
                :src="i.assignee.avatar_url ?? undefined"
                size="2xs"
              />
              <UIcon v-else name="i-lucide-user" class="size-4 text-dimmed" />
            </span>
            <span class="w-24 shrink-0 hidden xl:block text-xs" :class="i.due_date ? 'text-dimmed' : 'text-dimmed/50'">{{ i.due_date ?? '—' }}</span>
            <NuxtLink :to="issueLink(i)" class="w-24 shrink-0 hidden xl:block text-xs text-dimmed hover:underline">{{ timeAgo(i.updated_at) }}</NuxtLink>
            <span class="w-8 shrink-0 flex justify-center">
              <UButton :to="issueLink(i)" icon="i-lucide-arrow-up-right" variant="ghost" color="neutral" size="xs" square class="opacity-0 group-hover:opacity-100" />
            </span>
          </li>
          <li v-if="!sorted.length" class="p-8 text-center text-sm text-muted">No tasks match these filters.</li>
        </ul>

        <div v-if="sorted.length > PAGE_SIZE" class="flex items-center justify-between gap-3 px-4 py-3 border-t border-default">
          <span class="text-xs text-muted">
            {{ (page - 1) * PAGE_SIZE + 1 }}–{{ Math.min(page * PAGE_SIZE, sorted.length) }} of {{ sorted.length }}
          </span>
          <UPagination v-model:page="page" :total="sorted.length" :items-per-page="PAGE_SIZE" :sibling-count="1" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
