<script setup lang="ts">
import type { Profile } from '~/types/database'

definePageMeta({ layout: 'auth' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const profile = useState<Profile | null>('current-profile')
const checking = ref(false)

// If the user is already approved (e.g. an admin just approved them and they
// hit refresh), send them into the app.
async function recheck() {
  if (!user.value) return
  checking.value = true
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.value.id)
    .single()
  profile.value = (data as Profile | null) ?? null
  checking.value = false
  if (profile.value?.status === 'approved') {
    await navigateTo('/')
  }
}

onMounted(recheck)

const rejected = computed(() => profile.value?.status === 'rejected')

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <UCard>
    <div class="space-y-3 text-center py-4">
      <UIcon
        :name="rejected ? 'i-lucide-circle-x' : 'i-lucide-clock'"
        :class="rejected ? 'text-error' : 'text-primary'"
        class="size-10 mx-auto"
      />

      <template v-if="rejected">
        <p class="font-medium">Access not granted</p>
        <p class="text-sm text-muted text-balance">
          Your request to join couldn't be approved. If you think this is a
          mistake, contact your administrator.
        </p>
      </template>

      <template v-else>
        <p class="font-medium">Awaiting approval</p>
        <p class="text-sm text-muted text-balance">
          Your account has been created and is waiting for an administrator to
          approve access. You'll be able to sign in once it's approved.
        </p>
      </template>

      <div class="flex flex-col gap-2 pt-2">
        <UButton
          v-if="!rejected"
          variant="subtle"
          icon="i-lucide-rotate-cw"
          :loading="checking"
          label="Check again"
          block
          @click="recheck"
        />
        <UButton
          variant="ghost"
          icon="i-lucide-log-out"
          label="Sign out"
          block
          @click="signOut"
        />
      </div>
    </div>
  </UCard>
</template>
