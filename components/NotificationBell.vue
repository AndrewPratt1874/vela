<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { Notification } from '~/types/database'

const { items, unreadCount, markAllRead, markRead } = useNotifications()
const { isStaff } = useCurrentProfile()

const open = ref(false)

function linkFor(n: Notification) {
  if (!n.ticket_id) return undefined
  return isStaff.value ? `/tickets/${n.ticket_id}` : `/portal/tickets/${n.ticket_id}`
}

async function onClick(n: Notification) {
  if (!n.read) await markRead(n.id)
  const to = linkFor(n)
  open.value = false
  if (to) await navigateTo(to)
}

function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end', side: 'right' }">
    <UChip :show="unreadCount > 0" :text="unreadCount" size="2xl" color="error">
      <UButton color="neutral" variant="ghost" icon="i-lucide-bell" square aria-label="Notifications" />
    </UChip>

    <template #content>
      <div class="w-80 max-h-[28rem] flex flex-col">
        <div class="flex items-center justify-between px-3 py-2 border-b border-default">
          <span class="text-sm font-semibold">Notifications</span>
          <UButton
            v-if="unreadCount"
            variant="link"
            size="xs"
            label="Mark all read"
            @click="markAllRead"
          />
        </div>

        <div v-if="!items.length" class="px-3 py-10 text-center text-sm text-muted">
          <UIcon name="i-lucide-bell-off" class="size-7 mx-auto mb-2 text-dimmed" />
          You're all caught up.
        </div>

        <div v-else class="overflow-y-auto divide-y divide-default">
          <button
            v-for="n in items"
            :key="n.id"
            type="button"
            class="w-full text-left px-3 py-2.5 hover:bg-elevated/50 flex gap-2"
            :class="{ 'bg-primary/5': !n.read }"
            @click="onClick(n)"
          >
            <span class="mt-1.5 size-2 rounded-full shrink-0" :class="n.read ? 'bg-transparent' : 'bg-primary'" />
            <span class="min-w-0">
              <span class="block text-sm font-medium truncate">{{ n.title }}</span>
              <span v-if="n.body" class="block text-xs text-muted truncate">{{ n.body }}</span>
              <span class="block text-xs text-dimmed mt-0.5">{{ timeAgo(n.created_at) }}</span>
            </span>
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
