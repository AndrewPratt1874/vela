<script setup lang="ts">
import type { NavigationMenuItem, DropdownMenuItem } from '@nuxt/ui'

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const route = useRoute()
const sidebarOpen = ref(true)

const { isStaff } = useCurrentProfile()

const { data: projects } = await useAsyncData('sidebar-projects', async () => {
  if (!user.value) return []
  const { data } = await supabase
    .from('projects')
    .select('id, name, slug, key')
    .order('created_at', { ascending: false })
  return data ?? []
}, { watch: [user] })

const { data: pendingUsers } = await useAsyncData('sidebar-pending-users', async () => {
  if (!user.value || !isStaff.value) return 0
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return count ?? 0
}, { watch: [user, isStaff] })

const projectChildren = computed(() => [
  ...(projects.value ?? []).map((p) => ({
    label: p.name,
    icon: 'i-lucide-circle-dot',
    to: `/projects/${p.slug}`,
  })),
  ...(isStaff.value
    ? [{ label: 'New project', icon: 'i-lucide-plus', to: '/projects/new' }]
    : []),
])

const links = computed<NavigationMenuItem[][]>(() => {
  const projectsItem: NavigationMenuItem = {
    label: 'Projects',
    icon: 'i-lucide-folder-kanban',
    to: isStaff.value ? '/projects' : undefined,
    defaultOpen: route.path.startsWith('/projects'),
    children: projectChildren.value,
  }

  if (isStaff.value) {
    return [[
      { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/' },
      {
        label: 'Customers',
        icon: 'i-lucide-building-2',
        to: '/customers',
        defaultOpen: route.path.startsWith('/customers'),
      },
      {
        label: 'Tickets',
        icon: 'i-lucide-ticket',
        to: '/tickets',
        defaultOpen: route.path.startsWith('/tickets'),
      },
      {
        label: 'Users',
        icon: 'i-lucide-users',
        to: '/users',
        defaultOpen: route.path.startsWith('/users'),
        badge: pendingUsers.value
          ? { label: String(pendingUsers.value), color: 'warning' as const }
          : undefined,
      },
      projectsItem,
    ]]
  }

  // Customer portal navigation
  return [[
    { label: 'Home', icon: 'i-lucide-home', to: '/portal' },
    {
      label: 'Tickets',
      icon: 'i-lucide-ticket',
      to: '/portal/tickets',
      defaultOpen: route.path.startsWith('/portal/tickets'),
    },
    projectsItem,
  ]]
})

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: user.value?.email ?? '',
      type: 'label',
    },
  ],
  [
    {
      label: 'Sign out',
      icon: 'i-lucide-log-out',
      onSelect: async () => {
        await supabase.auth.signOut()
        await navigateTo('/login')
      },
    },
  ],
])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      id="sidebar"
      v-model:open="sidebarOpen"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2 px-2 py-1.5">
          <img src="/logo.png" alt="Vela" class="size-6 shrink-0 rounded" />
          <span v-if="!collapsed" class="text-lg font-semibold">
            {{ $config.public.appName }}
          </span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="links[0]"
          :collapsed="collapsed"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex items-center gap-1 w-full" :class="collapsed ? 'flex-col' : ''">
          <UDropdownMenu
            :items="userMenu"
            :content="{ align: 'end', side: 'right' }"
            class="flex-1 min-w-0"
          >
            <UButton
              color="neutral"
              variant="ghost"
              class="w-full"
              :square="collapsed"
              :label="collapsed ? undefined : (user?.email ?? '')"
              :ui="{ label: 'truncate' }"
            >
              <template #leading>
                <UAvatar
                  :alt="user?.email ?? ''"
                  size="2xs"
                  :src="user?.user_metadata?.avatar_url"
                />
              </template>
            </UButton>
          </UDropdownMenu>
          <NotificationBell />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
