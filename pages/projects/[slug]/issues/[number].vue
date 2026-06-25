<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { Attachment, IssuePriority, IssueStatus, IssueType, IssueWithPeople, Project } from '~/types/database'

const route = useRoute()
const supabase = useSupabaseClient()
const toast = useToast()
const user = useSupabaseUser()
const slug = computed(() => route.params.slug as string)
const number = computed(() => Number(route.params.number))

const { ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_TYPES, typeMap } = useIssueMeta()

const { data: project } = await useAsyncData(`issue-project-${slug.value}`, async () => {
  const { data } = await supabase.from('projects').select('*').eq('slug', slug.value).single()
  return data as Project | null
}, { watch: [slug] })

if (!project.value) {
  throw createError({ statusCode: 404, statusMessage: 'Project not found' })
}

const { data: issue, refresh: refreshIssue } = await useAsyncData(
  () => `issue-${project.value!.id}-${number.value}`,
  async () => {
    const { data } = await supabase
      .from('issues')
      .select('*, assignee:profiles!issues_assignee_id_fkey(id, full_name, email, avatar_url), reporter:profiles!issues_reporter_id_fkey(id, full_name, email, avatar_url), issue_labels(label_id)')
      .eq('project_id', project.value!.id)
      .eq('number', number.value)
      .single()
    return data as (IssueWithPeople & { issue_labels: { label_id: string }[] }) | null
  },
  { watch: [() => project.value?.id, number] },
)

if (!issue.value) {
  throw createError({ statusCode: 404, statusMessage: 'Issue not found' })
}

// Assignable to anyone associated with the project: members, approved staff,
// and the project customer's users.
const { assignees: members } = await useProjectAssignees(project.value.id, project.value.customer_id)

const { labels, createLabel, setIssueLabels } = useLabels(() => project.value?.id)

// Files attached to this issue. We also stamp project_id (via projectId) so they
// surface in the project's Files section — linking issues and files.
const attachmentParent = computed(() =>
  project.value?.customer_id
    ? { customerId: project.value.customer_id, key: 'issue_id' as const, id: issue.value!.id, projectId: project.value.id }
    : null,
)
const { attachments, upload: uploadAttachment, downloadUrl: attachmentUrl, remove: removeAttachment } = useAttachments(attachmentParent)

const fileInput = ref<HTMLInputElement | null>(null)
const uploadingFile = ref(false)
async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  uploadingFile.value = true
  try {
    for (const f of Array.from(input.files)) await uploadAttachment(f)
  } catch (err: any) {
    toast.add({ title: 'Upload failed', description: err?.message, color: 'error' })
  } finally {
    uploadingFile.value = false
    input.value = ''
  }
}
async function openAttachment(a: Attachment) {
  try {
    window.open(await attachmentUrl(a), '_blank')
  } catch (e: any) {
    toast.add({ title: 'Could not open file', description: e?.message, color: 'error' })
  }
}
function fileSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function iconFor(mime: string | null) {
  if (!mime) return 'i-lucide-file'
  if (mime.startsWith('image/')) return 'i-lucide-file-image'
  if (mime.includes('pdf')) return 'i-lucide-file-text'
  if (mime.includes('zip') || mime.includes('compressed')) return 'i-lucide-file-archive'
  if (mime.includes('sheet') || mime.includes('csv') || mime.includes('excel')) return 'i-lucide-file-spreadsheet'
  return 'i-lucide-file'
}

const editing = ref(false)
const draftTitle = ref(issue.value.title)
const draftDescription = ref(issue.value.description ?? '')
const draftResolution = ref(issue.value.resolution ?? '')
const selectedLabelIds = ref<string[]>(issue.value.issue_labels?.map((l) => l.label_id) ?? [])

watch(issue, (v) => {
  if (!v) return
  draftTitle.value = v.title
  draftDescription.value = v.description ?? ''
  draftResolution.value = v.resolution ?? ''
  selectedLabelIds.value = v.issue_labels?.map((l) => l.label_id) ?? []
})

type Patch = Partial<Pick<
  IssueWithPeople,
  'title' | 'description' | 'status' | 'priority' | 'type' | 'assignee_id' | 'resolution' | 'due_date' | 'estimate'
>>

async function patch(payload: Patch) {
  const { error } = await supabase.from('issues').update(payload).eq('id', issue.value!.id)
  if (error) {
    toast.add({ title: 'Update failed', description: error.message, color: 'error' })
    return
  }
  await refreshIssue()
}

async function saveContent() {
  await patch({ title: draftTitle.value, description: richTextOrNull(draftDescription.value) })
  editing.value = false
}

const savingResolution = ref(false)
async function saveResolution() {
  savingResolution.value = true
  await patch({ resolution: richTextOrNull(draftResolution.value) })
  savingResolution.value = false
  toast.add({ title: 'Resolution saved', color: 'success' })
}

async function saveLabels(ids: string[]) {
  selectedLabelIds.value = ids
  try {
    await setIssueLabels(issue.value!.id, ids)
    await refreshIssue()
  } catch (e: any) {
    toast.add({ title: 'Could not update labels', description: e?.message, color: 'error' })
  }
}

const newLabelName = ref('')
async function addLabel() {
  const name = newLabelName.value.trim()
  if (!name) return
  try {
    const created = await createLabel(name)
    if (created) await saveLabels([...selectedLabelIds.value, created.id])
    newLabelName.value = ''
  } catch (e: any) {
    toast.add({ title: 'Could not create label', description: e?.message, color: 'error' })
  }
}

async function remove() {
  if (!confirm('Delete this issue? This cannot be undone.')) return
  const { error } = await supabase.from('issues').delete().eq('id', issue.value!.id)
  if (error) {
    toast.add({ title: 'Delete failed', description: error.message, color: 'error' })
    return
  }
  toast.add({ title: 'Issue deleted', color: 'success' })
  await navigateTo(`/projects/${slug.value}`)
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
  })),
])

const updatedRelative = computed(() => formatDistanceToNow(new Date(issue.value!.updated_at), { addSuffix: true }))
</script>

<template>
  <UDashboardPanel id="issue-detail">
    <template #header>
      <UDashboardNavbar :title="`${project!.key}-${issue!.number}`" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton variant="ghost" :to="`/projects/${slug}`" icon="i-lucide-arrow-left" label="Back" />
          <UDropdownMenu
            :items="[[{ label: 'Delete issue', icon: 'i-lucide-trash-2', color: 'error', onSelect: remove }]]"
          >
            <UButton variant="ghost" icon="i-lucide-more-horizontal" square />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 grid lg:grid-cols-[1fr_280px] gap-6">
        <div class="space-y-4 min-w-0">
          <div v-if="editing">
            <UInput v-model="draftTitle" size="xl" class="w-full mb-3" />
            <RichTextEditor v-model="draftDescription" placeholder="Add a description..." />
            <div class="flex justify-end gap-2 mt-3">
              <UButton variant="ghost" label="Cancel" @click="editing = false" />
              <UButton color="primary" label="Save" @click="saveContent" />
            </div>
          </div>
          <div v-else>
            <div class="flex items-start justify-between gap-3 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <UIcon
                  :name="typeMap[issue!.type].icon"
                  :class="`text-${typeMap[issue!.type].color}`"
                  class="size-5 shrink-0"
                />
                <h1 class="text-2xl font-semibold">{{ issue!.title }}</h1>
              </div>
              <UButton variant="ghost" icon="i-lucide-pencil" square @click="editing = true" />
            </div>
            <div v-if="issue!.labels?.length || selectedLabelIds.length" class="flex flex-wrap gap-1 mb-3">
              <UBadge
                v-for="l in (labels ?? []).filter((x) => selectedLabelIds.includes(x.id))"
                :key="l.id"
                size="sm"
                variant="subtle"
                :color="(l.color as any)"
                :label="l.name"
              />
            </div>
            <RichTextContent :html="issue!.description" placeholder="No description." />
          </div>

          <USeparator />

          <!-- Resolution / outcome -->
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Resolution / outcome</p>
            <RichTextEditor
              v-model="draftResolution"
              placeholder="How was this resolved? (e.g. Fixed, Implemented check, See ENG-50)"
            />
            <div class="flex justify-end mt-2">
              <UButton
                size="sm"
                variant="subtle"
                :loading="savingResolution"
                label="Save resolution"
                @click="saveResolution"
              />
            </div>
          </div>

          <USeparator />

          <!-- Attachments -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs uppercase tracking-wide text-muted">Attachments</p>
              <UButton
                size="xs"
                variant="subtle"
                icon="i-lucide-paperclip"
                label="Attach"
                :loading="uploadingFile"
                :disabled="!attachmentParent"
                @click="fileInput?.click()"
              />
              <input ref="fileInput" type="file" multiple class="hidden" @change="onFilesPicked">
            </div>

            <UAlert
              v-if="!attachmentParent"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="No customer assigned"
              description="Assign this project to a customer before attaching files."
            />

            <p v-else-if="!attachments?.length" class="text-sm text-muted">
              No files attached. Anything you attach here also appears in the project's Files section.
            </p>

            <div v-else class="space-y-2">
              <div
                v-for="a in attachments"
                :key="a.id"
                class="group flex items-center gap-3 rounded-lg border border-default p-2.5 hover:border-primary transition"
              >
                <UIcon :name="iconFor(a.mime_type)" class="size-6 text-muted shrink-0" />
                <div class="min-w-0 flex-1">
                  <button class="text-sm font-medium truncate block w-full text-left hover:underline" @click="openAttachment(a)">
                    {{ a.file_name }}
                  </button>
                  <p class="text-xs text-dimmed">{{ fileSize(a.size_bytes) }}</p>
                </div>
                <UButton variant="ghost" icon="i-lucide-download" size="xs" square @click="openAttachment(a)" />
                <UButton
                  v-if="a.uploaded_by === user?.id"
                  variant="ghost" color="error" icon="i-lucide-trash-2" size="xs" square
                  @click="removeAttachment(a)"
                />
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Type</p>
            <USelectMenu
              :model-value="issue!.type"
              :items="typeItems"
              value-key="value"
              class="w-full"
              @update:model-value="(v: any) => patch({ type: v })"
            />
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Status</p>
            <USelectMenu
              :model-value="issue!.status"
              :items="statusItems"
              value-key="value"
              class="w-full"
              @update:model-value="(v: any) => patch({ status: v })"
            />
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Priority</p>
            <USelectMenu
              :model-value="issue!.priority"
              :items="priorityItems"
              value-key="value"
              class="w-full"
              @update:model-value="(v: any) => patch({ priority: v })"
            />
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Assignee</p>
            <USelectMenu
              :model-value="issue!.assignee_id"
              :items="assigneeItems"
              value-key="value"
              class="w-full"
              @update:model-value="(v: any) => patch({ assignee_id: v })"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-muted mb-1">Due date</p>
              <UInput
                :model-value="issue!.due_date ?? ''"
                type="date"
                class="w-full"
                @change="(e: any) => patch({ due_date: e.target.value || null })"
              />
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted mb-1">Estimate</p>
              <UInput
                :model-value="issue!.estimate ?? undefined"
                type="number"
                min="0"
                step="0.5"
                class="w-full"
                @change="(e: any) => patch({ estimate: e.target.value === '' ? null : Number(e.target.value) })"
              />
            </div>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Labels</p>
            <USelectMenu
              :model-value="selectedLabelIds"
              :items="labelItems"
              value-key="value"
              multiple
              placeholder="No labels"
              class="w-full"
              @update:model-value="(v: any) => saveLabels(v)"
            />
            <div class="flex gap-2 mt-2">
              <UInput v-model="newLabelName" placeholder="New label" size="sm" class="flex-1" @keydown.enter.prevent="addLabel" />
              <UButton variant="subtle" icon="i-lucide-plus" size="sm" square @click="addLabel" />
            </div>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted mb-1">Reporter</p>
            <div class="flex items-center gap-2 text-sm">
              <UAvatar
                size="2xs"
                :alt="issue!.reporter?.full_name ?? issue!.reporter?.email ?? ''"
                :src="issue!.reporter?.avatar_url ?? undefined"
              />
              <span>{{ issue!.reporter?.full_name ?? issue!.reporter?.email }}</span>
            </div>
          </div>
          <USeparator />
          <p class="text-xs text-muted">Updated {{ updatedRelative }}</p>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
