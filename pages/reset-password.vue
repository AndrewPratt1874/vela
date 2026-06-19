<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

// The recovery link redirects here; the Supabase client exchanges the code and
// establishes a short-lived session. We only show the form once that's ready.
const ready = ref(false)
const invalid = ref(false)

const password = ref('')
const confirm = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

onMounted(() => {
  if (user.value) {
    ready.value = true
    return
  }
  const { data: sub } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') ready.value = true
  })
  // If no recovery session materialises, the link was bad or expired.
  const timer = setTimeout(() => {
    if (!ready.value && !user.value) invalid.value = true
  }, 6000)
  onUnmounted(() => {
    sub.subscription.unsubscribe()
    clearTimeout(timer)
  })
})

watch(user, (u) => {
  if (u) ready.value = true
})

async function submit() {
  errorMessage.value = null
  if (password.value.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters'
    return
  }
  if (password.value !== confirm.value) {
    errorMessage.value = 'Passwords do not match'
    return
  }
  loading.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: password.value })
    if (error) throw error
    toast.add({ title: 'Password updated', description: 'You are now signed in.', color: 'success' })
    await navigateTo('/')
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Something went wrong'
    toast.add({ title: 'Could not update password', description: errorMessage.value!, color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col items-center gap-2 text-center py-2">
        <img src="/logo.png" alt="Vela" class="size-12 rounded-lg" />
        <h1 class="text-xl font-semibold">Set a new password</h1>
      </div>
    </template>

    <!-- Invalid / expired link -->
    <div v-if="invalid" class="space-y-2 text-center py-4">
      <UIcon name="i-lucide-link-2-off" class="text-error size-10 mx-auto" />
      <p class="font-medium">Link expired or invalid</p>
      <p class="text-sm text-muted text-balance">
        This password reset link is no longer valid. Request a new one to try again.
      </p>
      <div class="pt-2">
        <UButton to="/forgot-password" label="Request a new link" color="primary" />
      </div>
    </div>

    <!-- Waiting for the recovery session -->
    <div v-else-if="!ready" class="flex items-center justify-center gap-3 py-8">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-5 text-primary" />
      <span class="text-sm text-muted">Verifying your reset link…</span>
    </div>

    <!-- New password form -->
    <form v-else class="space-y-4" @submit.prevent="submit">
      <UFormField label="New password" name="password" required>
        <UInput
          v-model="password"
          type="password"
          placeholder="••••••••"
          autocomplete="new-password"
          autofocus
          required
          class="w-full"
        />
      </UFormField>

      <UFormField label="Confirm new password" name="confirm" required>
        <UInput
          v-model="confirm"
          type="password"
          placeholder="••••••••"
          autocomplete="new-password"
          required
          class="w-full"
        />
      </UFormField>

      <p v-if="errorMessage" class="text-sm text-error">{{ errorMessage }}</p>

      <UButton type="submit" :loading="loading" block label="Update password" />
    </form>
  </UCard>
</template>
