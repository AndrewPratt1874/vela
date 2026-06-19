<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { IssuePriority } from '~/types/database'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const { customerId } = useCurrentProfile()
const { ISSUE_PRIORITIES } = useIssueMeta()

if (!customerId.value) {
  // Unallocated users can't raise tickets.
  await navigateTo('/portal')
}

const schema = z.object({
  subject: z.string().min(3, 'Please add a subject'),
  body: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ subject: '', body: '', priority: 'medium' as IssuePriority })
const priorityItems = ISSUE_PRIORITIES.map((p) => ({ label: p.label, value: p.value, icon: p.icon }))

const pendingFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) pendingFiles.value = [...pendingFiles.value, ...Array.from(input.files)]
  input.value = ''
}
function removePending(i: number) {
  pendingFiles.value = pendingFiles.value.filter((_, idx) => idx !== i)
}

const loading = ref(false)

async function submit(event: FormSubmitEvent<Schema>) {
  if (!user.value || !customerId.value) return
  loading.value = true
  try {
    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        customer_id: customerId.value,
        subject: event.data.subject,
        body: richTextOrNull(event.data.body),
        priority: event.data.priority,
        created_by: user.value.id,
      })
      .select()
      .single()
    if (error || !ticket) throw error ?? new Error('Failed')

    // Upload attachments to the new ticket
    for (const f of pendingFiles.value) {
      const path = `customers/${customerId.value}/ticket/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, f, { contentType: f.type || undefined })
      if (upErr) continue
      await supabase.from('attachments').insert({
        customer_id: customerId.value,
        storage_path: path,
        file_name: f.name,
        mime_type: f.type || null,
        size_bytes: f.size,
        uploaded_by: user.value.id,
        ticket_id: ticket.id,
      })
    }

    await notifyTicketEvent(ticket.id, 'created')
    toast.add({ title: 'Ticket raised', color: 'success' })
    await navigateTo(`/portal/tickets/${ticket.id}`)
  } catch (e: any) {
    loading.value = false
    toast.add({ title: 'Could not raise ticket', description: e?.message, color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="new-ticket">
    <template #header>
      <UDashboardNavbar title="New ticket" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 max-w-2xl">
        <UForm :schema="schema" :state="state" class="space-y-4" @submit="submit">
          <UFormField label="Subject" name="subject" required>
            <UInput v-model="state.subject" placeholder="Briefly, what's up?" class="w-full" autofocus />
          </UFormField>

          <UFormField label="Details" name="body">
            <RichTextEditor v-model="state.body" placeholder="Describe the issue or request..." />
          </UFormField>

          <UFormField label="Priority" name="priority">
            <USelectMenu v-model="state.priority" :items="priorityItems" value-key="value" class="w-full sm:w-60" />
          </UFormField>

          <UFormField label="Attachments">
            <div class="space-y-2">
              <UButton variant="subtle" icon="i-lucide-paperclip" size="sm" label="Add files" @click="fileInput?.click()" />
              <input ref="fileInput" type="file" multiple class="hidden" @change="onFilesPicked">
              <div v-if="pendingFiles.length" class="flex flex-wrap gap-2">
                <div v-for="(f, i) in pendingFiles" :key="i" class="flex items-center gap-1.5 rounded-md bg-elevated px-2 py-1 text-xs">
                  <UIcon name="i-lucide-file" class="size-3.5" />
                  <span class="truncate max-w-[160px]">{{ f.name }}</span>
                  <UButton variant="ghost" color="error" icon="i-lucide-x" size="xs" square @click="removePending(i)" />
                </div>
              </div>
            </div>
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" to="/portal/tickets" label="Cancel" />
            <UButton type="submit" :loading="loading" label="Raise ticket" color="primary" />
          </div>
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
