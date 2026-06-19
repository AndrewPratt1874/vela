<script setup lang="ts">
import type { Profile, UserStatus } from '~/types/database'

definePageMeta({ middleware: 'staff' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

type Row = Profile & { customer: { name: string } | null }

const { data: users, refresh, pending } = await useAsyncData('users-admin', async () => {
  const { data } = await supabase
    .from('profiles')
    .select('*, customer:customers(name)')
    .order('created_at', { ascending: false })
  return (data ?? []) as Row[]
})

const pendingUsers = computed(() => (users.value ?? []).filter((u) => u.status === 'pending'))
const otherUsers = computed(() => (users.value ?? []).filter((u) => u.status !== 'pending'))

const statusBadge: Record<UserStatus, { label: string, color: 'warning' | 'success' | 'error' }> = {
  pending: { label: 'Pending', color: 'warning' },
  approved: { label: 'Approved', color: 'success' },
  rejected: { label: 'Rejected', color: 'error' },
}

function roleLabel(u: Row) {
  if (u.is_staff) return 'Staff'
  if (u.customer?.name) return u.customer.name
  return 'No access'
}

const busy = ref<string | null>(null)

async function setStatus(target: Row, action: 'approve' | 'reject') {
  busy.value = target.id
  const fn = action === 'approve' ? 'approve_user' : 'reject_user'
  const { error } = await supabase.rpc(fn, { target: target.id })
  busy.value = null
  if (error) {
    toast.add({ title: `Could not ${action} user`, description: error.message, color: 'error' })
    return
  }
  toast.add({
    title: action === 'approve' ? 'User approved' : 'User rejected',
    description: `${target.full_name ?? target.email}`,
    color: action === 'approve' ? 'success' : 'warning',
  })
  await refresh()
}

const df = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
function fmt(d: string) {
  return df.format(new Date(d))
}
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Users" :ui="{ root: 'border-b border-default' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            v-if="pendingUsers.length"
            color="warning"
            variant="subtle"
            :label="`${pendingUsers.length} pending`"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 lg:p-6 space-y-8">
        <!-- Pending approvals -->
        <section v-if="pendingUsers.length" class="space-y-3">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
            Awaiting approval
          </h2>
          <div class="space-y-2">
            <div
              v-for="u in pendingUsers"
              :key="u.id"
              class="flex items-center gap-3 rounded-lg border border-default p-3"
            >
              <UAvatar :alt="u.full_name ?? u.email ?? ''" :src="u.avatar_url ?? undefined" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="font-medium truncate">{{ u.full_name ?? '—' }}</p>
                <p class="text-sm text-muted truncate">{{ u.email }}</p>
              </div>
              <UBadge variant="outline" color="neutral" size="sm" :label="roleLabel(u)" />
              <div class="flex gap-2">
                <UButton
                  size="sm"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-x"
                  label="Reject"
                  :loading="busy === u.id"
                  @click="setStatus(u, 'reject')"
                />
                <UButton
                  size="sm"
                  color="primary"
                  icon="i-lucide-check"
                  label="Approve"
                  :loading="busy === u.id"
                  @click="setStatus(u, 'approve')"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- All other users -->
        <section class="space-y-3">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
            All users
          </h2>

          <div v-if="pending && !users?.length" class="text-sm text-muted">Loading…</div>

          <div v-else class="overflow-hidden rounded-lg border border-default">
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 text-muted">
                <tr>
                  <th class="text-left font-medium p-3">User</th>
                  <th class="text-left font-medium p-3">Access</th>
                  <th class="text-left font-medium p-3">Status</th>
                  <th class="text-left font-medium p-3 hidden sm:table-cell">Joined</th>
                  <th class="text-right font-medium p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="u in otherUsers"
                  :key="u.id"
                  class="border-t border-default"
                >
                  <td class="p-3">
                    <div class="flex items-center gap-2 min-w-0">
                      <UAvatar :alt="u.full_name ?? u.email ?? ''" :src="u.avatar_url ?? undefined" size="2xs" />
                      <div class="min-w-0">
                        <p class="font-medium truncate">{{ u.full_name ?? '—' }}</p>
                        <p class="text-xs text-muted truncate">{{ u.email }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="p-3">{{ roleLabel(u) }}</td>
                  <td class="p-3">
                    <UBadge
                      :color="statusBadge[u.status].color"
                      variant="subtle"
                      size="sm"
                      :label="statusBadge[u.status].label"
                    />
                  </td>
                  <td class="p-3 hidden sm:table-cell text-muted">{{ fmt(u.created_at) }}</td>
                  <td class="p-3 text-right">
                    <span v-if="u.id === user?.id" class="text-xs text-dimmed">You</span>
                    <template v-else>
                      <UButton
                        v-if="u.status === 'approved'"
                        size="xs"
                        color="error"
                        variant="ghost"
                        label="Revoke"
                        :loading="busy === u.id"
                        @click="setStatus(u, 'reject')"
                      />
                      <UButton
                        v-else
                        size="xs"
                        color="primary"
                        variant="subtle"
                        label="Approve"
                        :loading="busy === u.id"
                        @click="setStatus(u, 'approve')"
                      />
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
