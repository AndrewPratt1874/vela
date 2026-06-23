<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const route = useRoute()
const toast = useToast()

// Supabase reports failed/expired links via either the query string or the URL
// hash fragment (#error=...). Read both so we can show a real message instead of
// spinning on a session that will never arrive.
function readAuthError() {
  const fromQuery = route.query.error_code || route.query.error
  if (fromQuery) {
    return {
      code: String(route.query.error_code || route.query.error),
      description: route.query.error_description
        ? String(route.query.error_description).replace(/\+/g, ' ')
        : null,
    }
  }
  if (import.meta.client && window.location.hash) {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const code = hash.get('error_code') || hash.get('error')
    if (code) {
      return {
        code,
        description: hash.get('error_description')?.replace(/\+/g, ' ') ?? null,
      }
    }
  }
  return null
}

const authError = ref<{ code: string; description: string | null } | null>(readAuthError())
const expired = computed(
  () => authError.value?.code === 'otp_expired' || authError.value?.code === 'access_denied',
)

const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const code = ref('')
const resending = ref(false)
const verifying = ref(false)

async function verifyCode() {
  if (!email.value || !code.value) return
  verifying.value = true
  try {
    const { error } = await supabase.auth.verifyOtp({
      email: email.value,
      token: code.value.trim(),
      type: 'signup',
    })
    if (error) throw error
    await navigateTo('/')
  } catch (err: any) {
    toast.add({
      title: 'Could not confirm',
      description: err?.message ?? 'That code is invalid or expired',
      color: 'error',
    })
  } finally {
    verifying.value = false
  }
}

async function resendConfirmation() {
  if (!email.value) return
  resending.value = true
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.value,
      options: { emailRedirectTo: `${window.location.origin}/confirm` },
    })
    if (error) throw error
    toast.add({
      title: 'Confirmation email sent',
      description: `We sent a fresh link to ${email.value}.`,
      color: 'success',
    })
  } catch (err: any) {
    toast.add({
      title: 'Could not resend',
      description: err?.message ?? 'Something went wrong',
      color: 'error',
    })
  } finally {
    resending.value = false
  }
}

watch(
  user,
  (value) => {
    if (value) navigateTo('/')
  },
  { immediate: true },
)

// Fallback: if there's no error but no session materialises either (e.g. the hash
// was consumed but sign-in silently failed), don't spin forever.
onMounted(() => {
  if (authError.value) return
  setTimeout(() => {
    if (!user.value && !authError.value) {
      authError.value = { code: 'timeout', description: 'We could not sign you in from this link.' }
    }
  }, 8000)
})
</script>

<template>
  <UCard>
    <div v-if="authError" class="space-y-3 text-center py-4">
      <UIcon name="i-lucide-mail-x" class="text-error size-10 mx-auto" />
      <p class="font-medium">
        {{ expired ? 'This link has expired' : 'We couldn’t confirm your email' }}
      </p>
      <p class="text-sm text-muted text-balance">
        {{
          expired
            ? 'Enter the 6-digit code from your confirmation email, or resend a new one.'
            : (authError.description || 'Enter the 6-digit code from your confirmation email, or resend a new one.')
        }}
      </p>

      <form class="space-y-3 pt-2 text-left" @submit.prevent="verifyCode">
        <UFormField label="Email" name="email">
          <UInput
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            required
            class="w-full"
          />
        </UFormField>
        <UFormField label="Confirmation code" name="code">
          <UInput
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="123456"
            maxlength="6"
            required
            class="w-full"
          />
        </UFormField>
        <UButton type="submit" :loading="verifying" block>Confirm email</UButton>
      </form>

      <div class="flex items-center justify-center gap-3 pt-1">
        <UButton
          variant="link"
          color="neutral"
          icon="i-lucide-rotate-cw"
          :loading="resending"
          label="Resend code"
          @click="resendConfirmation"
        />
        <UButton variant="link" color="neutral" to="/login" label="Back to sign in" />
      </div>
    </div>

    <div v-else class="flex items-center gap-3 py-4">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-5 text-primary" />
      <span>Signing you in…</span>
    </div>
  </UCard>
</template>
