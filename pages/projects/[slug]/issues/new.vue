<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { IssuePriority, IssueStatus, IssueType, Profile, Project } from '~/types/database'

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const slug = computed(() => route.params.slug as string)

const { ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_TYPES } = useIssueMeta()

const { data: project } = await useAsyncData(`new-issue-project-${slug.value}`, async () => {
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

const { data: members } = await useAsyncData(`members-${project.value.id}`, async () => {
  const { data } = await supabase
    .from('project_members')
    .select('profile:profiles(id, full_name, email, avatar_url)')
    .eq('project_id', project.value!.id)
  return ((data ?? []).map((m: any) => m.profile).filter(Boolean)) as Profile[]
})

const { labels, createLabel, setIssueLabels } = useLabels(() => project.value?.id)

const schema = z.object({
  title: z.string().min(2, 'Title is required'),
  description: z.string().optional(),
  type: z.enum(['bug', 'feature', 'task', 'improvement']),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  assignee_id: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  estimate: z.number().nullable().optional(),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  title: '',
  description: '',
  type: 'task' as IssueType,
  status: 'todo' as IssueStatus,
  priority: 'medium' as IssuePriority,
  assignee_id: null,
  due_date: null,
  estimate: null,
})

// Selected label ids (managed outside the zod schema)
const selectedLabelIds = ref<string[]>([])
const newLabelName = ref('')
async function addLabel() {
  const name = newLabelName.value.trim()
  if (!name) return
  try {
    const created = await createLabel(name)
    if (created) selectedLabelIds.value = [...selectedLabelIds.value, created.id]
    newLabelName.value = ''
  } catch (e: any) {
    toast.add({ title: 'Could not create label', description: e?.message, color: 'error' })
  }
}

const typeItems = ISSUE_TYPES.map((t) => ({ label: t.label, value: t.value, icon: t.icon }))
const statusItems = ISSUE_STATUSES.map((s) => ({ label: s.label, value: s.value, icon: s.icon }))
const priorityItems = ISSUE_PRIORITIES.map((p) => ({ label: p.label, value: p.value, icon: p.icon }))
const labelItems = computed(() => (labels.value ?? []).map((l) => ({ label: l.name, value: l.id })))
const assigneeItems = computed(() => [
  { label: 'Unassigned', value: null },
  ...(members.value ?? []).map((m) => ({
    label: m.full_name ?? m.email ?? 'Unknown',
    value: m.id,
    avatar: { src: m.avatar_url ?? undefined, alt: m.full_name ?? m.email ?? '' },
  })),
])

const loading = ref(false)

async function submit(event: FormSubmitEvent<Schema>) {
  if (!user.value || !project.value) return
  loading.value = true
  const { data, error } = await supabase
    .from('issues')
    .insert({
      project_id: project.value.id,
      title: event.data.title,
      description: richTextOrNull(event.data.description),
      type: event.data.type,
      status: event.data.status,
      priority: event.data.priority,
      assignee_id: event.data.assignee_id ?? null,
      due_date: event.data.due_date || null,
      estimate: event.data.estimate ?? null,
      reporter_id: user.value.id,
    })
    .select()
    .single()
  if (error || !data) {
    loading.value = false
    toast.add({ title: 'Could not create issue', description: error?.message, color: 'error' })
    return
  }

  if (selectedLabelIds.value.length) {
    try {
      await setIssueLabels(data.id, selectedLabelIds.value)
    } catch (e: any) {
      toast.add({ title: 'Issue created, but labels failed', description: e?.message, color: 'warning' })
    }
  }

  loading.value = false
  toast.add({ title: `Created ${project.value.key}-${data.number}`, color: 'success' })
  await navigateTo(`/projects/${slug.value}/issues/${data.number}`)
}
</script>

<template>
  <UDashboardPanel id="new-issue">
    <template #header>
      <UDashboardNavbar :title="`New issue in ${project!.name}`" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 max-w-2xl">
        <UForm :schema="schema" :state="state" class="space-y-4" @submit="submit">
          <UFormField label="Title" name="title" required>
            <UInput v-model="state.title" placeholder="What needs to happen?" class="w-full" autofocus />
          </UFormField>

          <UFormField label="Description" name="description">
            <RichTextEditor v-model="state.description" placeholder="Describe the issue..." />
          </UFormField>

          <div class="grid sm:grid-cols-3 gap-4">
            <UFormField label="Type" name="type">
              <USelectMenu v-model="state.type" :items="typeItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Status" name="status">
              <USelectMenu v-model="state.status" :items="statusItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Priority" name="priority">
              <USelectMenu v-model="state.priority" :items="priorityItems" value-key="value" class="w-full" />
            </UFormField>
          </div>

          <div class="grid sm:grid-cols-3 gap-4">
            <UFormField label="Assignee" name="assignee_id">
              <USelectMenu v-model="state.assignee_id" :items="assigneeItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Due date" name="due_date">
              <UInput v-model="state.due_date" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Estimate" name="estimate" help="points or hours">
              <UInput v-model.number="state.estimate" type="number" min="0" step="0.5" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Labels" name="labels">
            <USelectMenu
              v-model="selectedLabelIds"
              :items="labelItems"
              value-key="value"
              multiple
              placeholder="Select labels"
              class="w-full"
            />
            <div class="flex gap-2 mt-2">
              <UInput v-model="newLabelName" placeholder="New label name" size="sm" class="flex-1" @keydown.enter.prevent="addLabel" />
              <UButton variant="subtle" icon="i-lucide-plus" size="sm" label="Add" @click="addLabel" />
            </div>
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" :to="`/projects/${slug}`" label="Cancel" />
            <UButton type="submit" :loading="loading" label="Create issue" color="primary" />
          </div>
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
