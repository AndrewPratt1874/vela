<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { Attachment, Project } from '~/types/database'

const route = useRoute()
const supabase = useSupabaseClient()
const toast = useToast()
const user = useSupabaseUser()
const slug = computed(() => route.params.slug as string)

const { data: project } = await useAsyncData(`files-project-${slug.value}`, async () => {
  const { data } = await supabase.from('projects').select('*').eq('slug', slug.value).single()
  return data as Project | null
}, { watch: [slug] })

if (!project.value) {
  throw createError({ statusCode: 404, statusMessage: 'Project not found' })
}

const parent = computed(() =>
  project.value?.customer_id
    ? { customerId: project.value.customer_id, key: 'project_id' as const, id: project.value.id }
    : null,
)
const { attachments, upload, downloadUrl, remove } = useAttachments(parent)

// Map issue id -> number so files attached to an issue can link back to it.
const { data: issues } = await useAsyncData(`files-issues-${slug.value}`, async () => {
  if (!project.value) return []
  const { data } = await supabase
    .from('issues')
    .select('id, number')
    .eq('project_id', project.value.id)
  return (data ?? []) as { id: string; number: number }[]
}, { watch: [slug] })
const issueNumberById = computed(() =>
  Object.fromEntries((issues.value ?? []).map((i) => [i.id, i.number])),
)

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  uploading.value = true
  try {
    for (const f of Array.from(input.files)) await upload(f)
  } catch (err: any) {
    toast.add({ title: 'Upload failed', description: err?.message, color: 'error' })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function open(a: Attachment) {
  try {
    window.open(await downloadUrl(a), '_blank')
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
function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}
function iconFor(mime: string | null) {
  if (!mime) return 'i-lucide-file'
  if (mime.startsWith('image/')) return 'i-lucide-file-image'
  if (mime.includes('pdf')) return 'i-lucide-file-text'
  if (mime.includes('zip') || mime.includes('compressed')) return 'i-lucide-file-archive'
  if (mime.includes('sheet') || mime.includes('csv') || mime.includes('excel')) return 'i-lucide-file-spreadsheet'
  return 'i-lucide-file'
}
</script>

<template>
  <UDashboardPanel id="project-files">
    <template #header>
      <UDashboardNavbar :title="`${project!.name} — Files`" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            :loading="uploading"
            icon="i-lucide-upload"
            label="Upload"
            color="primary"
            :disabled="!parent"
            @click="fileInput?.click()"
          />
          <input ref="fileInput" type="file" multiple class="hidden" @change="onFilesPicked">
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6">
        <UAlert
          v-if="!parent"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="No customer assigned"
          description="Assign this project to a customer before uploading files."
          class="mb-4"
        />

        <div v-if="!attachments?.length" class="rounded-lg border border-dashed border-default p-12 text-center">
          <UIcon name="i-lucide-folder-open" class="size-10 mx-auto mb-3 text-dimmed" />
          <h2 class="font-semibold mb-1">No files yet</h2>
          <p class="text-sm text-muted mb-4">Upload documents, designs, or anything else for this project.</p>
          <UButton v-if="parent" :loading="uploading" label="Upload a file" color="primary" @click="fileInput?.click()" />
        </div>

        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="a in attachments"
            :key="a.id"
            class="group flex items-center gap-3 rounded-lg border border-default p-3 hover:border-primary transition"
          >
            <UIcon :name="iconFor(a.mime_type)" class="size-8 text-muted shrink-0" />
            <div class="min-w-0 flex-1">
              <button class="text-sm font-medium truncate block w-full text-left hover:underline" @click="open(a)">
                {{ a.file_name }}
              </button>
              <p class="text-xs text-dimmed">{{ fileSize(a.size_bytes) }} · {{ timeAgo(a.created_at) }}</p>
              <ULink
                v-if="a.issue_id && issueNumberById[a.issue_id]"
                :to="`/projects/${slug}/issues/${issueNumberById[a.issue_id]}`"
                class="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
              >
                <UIcon name="i-lucide-circle-dot" class="size-3" />
                {{ project!.key }}-{{ issueNumberById[a.issue_id] }}
              </ULink>
            </div>
            <UButton variant="ghost" icon="i-lucide-download" size="xs" square @click="open(a)" />
            <UButton
              v-if="a.uploaded_by === user?.id"
              variant="ghost" color="error" icon="i-lucide-trash-2" size="xs" square
              @click="remove(a)"
            />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
