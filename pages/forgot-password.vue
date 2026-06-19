<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const supabase = useSupabaseClient()
const toast = useToast()

const email = ref('')
const loading = ref(false)
const sent = ref(false)

async function submit() {
  loading.value = true
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
    sent.value = true
  } catch (err: any) {
    toast.add({
      title: 'Could not send reset link',
      description: err?.message ?? 'Something went wrong',
      color: 'error',
    })
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
        <h1 class="text-xl font-semibold">Reset your password</h1>
      </div>
    </template>

    <div v-if="sent" class="space-y-2 text-center py-4">
      <UIcon name="i-lucide-mail-check" class="text-primary size-10 mx-auto" />
      <p class="font-medium">Check your email</p>
      <p class="text-sm text-muted text-balance">
        If an account exists for <strong>{{ email }}</strong>, we've sent a link to
        reset your password. The link expires shortly, so use it soon.
      </p>
      <div class="pt-2">
        <UButton variant="link" to="/login" label="Back to sign in" />
      </div>
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <p class="text-sm text-muted">
        Enter your email and we'll send you a link to set a new password.
      </p>

      <UFormField label="Email" name="email" required>
        <UInput
          v-model="email"
          type="email"
          placeholder="you@example.com"
          autofocus
          autocomplete="email"
          required
          class="w-full"
        />
      </UFormField>

      <UButton type="submit" :loading="loading" block label="Send reset link" />
    </form>

    <template v-if="!sent" #footer>
      <p class="text-sm text-center text-muted">
        Remembered it?
        <UButton variant="link" class="p-0" to="/login" label="Back to sign in" />
      </p>
    </template>
  </UCard>
</template>
