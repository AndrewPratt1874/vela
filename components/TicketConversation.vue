<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { Attachment, PersonRef, TicketComment } from '~/types/database'

const props = defineProps<{
  ticketId: string
  customerId: string
  body: string | null
  reporter: PersonRef | null
  createdAt: string
}>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

const { data: comments, refresh: refreshComments } = await useAsyncData(
  `ticket-comments-${props.ticketId}`,
  async () => {
    const { data } = await supabase
      .from('ticket_comments')
      .select('*, author:profiles(id, full_name, email, avatar_url)')
      .eq('ticket_id', props.ticketId)
      .order('created_at', { ascending: true })
    return (data ?? []) as Array<TicketComment & { author: PersonRef | null }>
  },
)

const parent = computed(() => ({ customerId: props.customerId, key: 'ticket_id' as const, id: props.ticketId }))
const { attachments, upload, downloadUrl, remove } = useAttachments(parent)

const reply = ref('')
const pendingFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const sending = ref(false)

function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) pendingFiles.value = [...pendingFiles.value, ...Array.from(input.files)]
  input.value = ''
}
function removePending(i: number) {
  pendingFiles.value = pendingFiles.value.filter((_, idx) => idx !== i)
}

async function openAttachment(a: Attachment) {
  try {
    const url = await downloadUrl(a)
    window.open(url, '_blank')
  } catch (e: any) {
    toast.add({ title: 'Could not open file', description: e?.message, color: 'error' })
  }
}

const replyEmpty = computed(() => isRichTextEmpty(reply.value))
const canSend = computed(() => !replyEmpty.value || pendingFiles.value.length > 0)

async function submit() {
  if (!user.value || !canSend.value) return
  sending.value = true
  try {
    // Upload any attached files to the ticket first
    for (const f of pendingFiles.value) await upload(f)
    pendingFiles.value = []

    if (!replyEmpty.value) {
      const { error } = await supabase.from('ticket_comments').insert({
        ticket_id: props.ticketId,
        author_id: user.value.id,
        body: reply.value,
      })
      if (error) throw error
      // Plain-text excerpt for the email notification quote
      const excerpt = (reply.value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      await notifyTicketEvent(props.ticketId, 'comment', excerpt)
      reply.value = ''
      await refreshComments()
    }
  } catch (e: any) {
    toast.add({ title: 'Could not send', description: e?.message, color: 'error' })
  } finally {
    sending.value = false
  }
}

function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}
function fileSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="space-y-5">
    <!-- Original message -->
    <div class="flex gap-3">
      <UAvatar :alt="reporter?.full_name ?? reporter?.email ?? ''" :src="reporter?.avatar_url ?? undefined" size="sm" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium">{{ reporter?.full_name ?? reporter?.email }}</span>
          <span class="text-xs text-dimmed">{{ timeAgo(createdAt) }}</span>
        </div>
        <RichTextContent :html="body" placeholder="No description provided." class="mt-1" />
      </div>
    </div>

    <!-- Attachments on the ticket -->
    <div v-if="attachments?.length" class="pl-11 space-y-1.5">
      <p class="text-xs uppercase tracking-wide text-muted">Attachments</p>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="a in attachments"
          :key="a.id"
          class="flex items-center gap-2 rounded-md border border-default px-2.5 py-1.5 text-sm"
        >
          <UIcon name="i-lucide-paperclip" class="size-4 text-muted shrink-0" />
          <button class="hover:underline truncate max-w-[180px]" @click="openAttachment(a)">{{ a.file_name }}</button>
          <span class="text-xs text-dimmed">{{ fileSize(a.size_bytes) }}</span>
          <UButton
            v-if="a.uploaded_by === user?.id"
            variant="ghost" color="error" icon="i-lucide-x" size="xs" square
            @click="remove(a)"
          />
        </div>
      </div>
    </div>

    <USeparator />

    <!-- Comment thread -->
    <div v-if="comments?.length" class="space-y-4">
      <div v-for="c in comments" :key="c.id" class="flex gap-3">
        <UAvatar :alt="c.author?.full_name ?? c.author?.email ?? ''" :src="c.author?.avatar_url ?? undefined" size="sm" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ c.author?.full_name ?? c.author?.email }}</span>
            <span class="text-xs text-dimmed">{{ timeAgo(c.created_at) }}</span>
          </div>
          <RichTextContent :html="c.body" class="mt-1" />
        </div>
      </div>
    </div>
    <p v-else class="text-sm text-dimmed">No replies yet.</p>

    <!-- Reply box -->
    <div class="rounded-lg border border-default p-3 space-y-2">
      <RichTextEditor v-model="reply" placeholder="Write a reply..." />
      <div v-if="pendingFiles.length" class="flex flex-wrap gap-2">
        <div
          v-for="(f, i) in pendingFiles"
          :key="i"
          class="flex items-center gap-1.5 rounded-md bg-elevated px-2 py-1 text-xs"
        >
          <UIcon name="i-lucide-file" class="size-3.5" />
          <span class="truncate max-w-[140px]">{{ f.name }}</span>
          <UButton variant="ghost" color="error" icon="i-lucide-x" size="xs" square @click="removePending(i)" />
        </div>
      </div>
      <div class="flex items-center justify-between">
        <UButton variant="ghost" icon="i-lucide-paperclip" size="sm" label="Attach" @click="fileInput?.click()" />
        <input ref="fileInput" type="file" multiple class="hidden" @change="onFilesPicked">
        <UButton
          :loading="sending"
          :disabled="!canSend"
          icon="i-lucide-send"
          label="Send"
          @click="submit"
        />
      </div>
    </div>
  </div>
</template>
