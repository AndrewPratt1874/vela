<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const supabase = useSupabaseClient()
const toast = useToast()

type Mode = 'signin' | 'signup'
const mode = ref<Mode>('signin')

const fullName = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const resending = ref(false)
const verifying = ref(false)
const code = ref('')
const errorMessage = ref<string | null>(null)
const needsConfirm = ref(false)

const isSignup = computed(() => mode.value === 'signup')

function toggleMode() {
  mode.value = isSignup.value ? 'signin' : 'signup'
  errorMessage.value = null
}

async function submit() {
  errorMessage.value = null
  loading.value = true
  try {
    if (isSignup.value) {
      const { data, error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
          data: { full_name: fullName.value || undefined },
          emailRedirectTo: `${window.location.origin}/confirm`,
        },
      })
      if (error) throw error
      // Best-effort: alert staff that someone is awaiting approval. The profile
      // is created synchronously by the signup trigger, so it exists by now.
      $fetch('/api/notify-registration', { method: 'POST', body: { email: email.value } }).catch(() => {})
      // If email confirmation is enabled, there is no session yet.
      if (!data.session) {
        needsConfirm.value = true
        return
      }
      await navigateTo('/')
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      await navigateTo('/')
    }
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Something went wrong'
    toast.add({
      title: isSignup.value ? 'Sign up failed' : 'Sign in failed',
      description: errorMessage.value!,
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}

async function verifyCode() {
  if (!code.value) return
  verifying.value = true
  errorMessage.value = null
  try {
    const { error } = await supabase.auth.verifyOtp({
      email: email.value,
      token: code.value.trim(),
      type: 'signup',
    })
    if (error) throw error
    await navigateTo('/')
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'That code is invalid or expired'
    toast.add({
      title: 'Could not confirm',
      description: errorMessage.value!,
      color: 'error',
    })
  } finally {
    verifying.value = false
  }
}

async function resendConfirmation() {
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
      description: `We re-sent the link to ${email.value}.`,
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
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col items-center gap-2 text-center py-2">
        <img src="/logo.png" alt="Vela" class="size-12 rounded-lg" />
        <h1 class="text-xl font-semibold">{{ $config.public.appName }}</h1>
        <p class="text-sm text-muted text-balance">
          Stay on course — with Codable.
        </p>
      </div>
    </template>

    <div v-if="needsConfirm" class="space-y-3 text-center py-4">
      <UIcon name="i-lucide-mail-check" class="text-primary size-10 mx-auto" />
      <p class="font-medium">Confirm your email</p>
      <p class="text-sm text-muted text-balance">
        We sent a 6-digit code to <strong>{{ email }}</strong>. Enter it below to finish creating your account.
      </p>

      <form class="space-y-3 pt-1 text-left" @submit.prevent="verifyCode">
        <UFormField label="Confirmation code" name="code">
          <UInput
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="123456"
            maxlength="6"
            autofocus
            required
            class="w-full"
          />
        </UFormField>

        <p v-if="errorMessage" class="text-sm text-error">{{ errorMessage }}</p>

        <UButton type="submit" :loading="verifying" block>Confirm email</UButton>
      </form>

      <div class="pt-1">
        <UButton
          variant="link"
          color="neutral"
          icon="i-lucide-rotate-cw"
          :loading="resending"
          label="Resend code"
          @click="resendConfirmation"
        />
        <p class="text-xs text-dimmed mt-1">
          Didn't get it? Check spam, then resend.
        </p>
      </div>
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <UFormField v-if="isSignup" label="Full name" name="fullName">
        <UInput
          v-model="fullName"
          placeholder="Ada Lovelace"
          autocomplete="name"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Email" name="email">
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

      <UFormField label="Password" name="password">
        <UInput
          v-model="password"
          type="password"
          placeholder="••••••••"
          :autocomplete="isSignup ? 'new-password' : 'current-password'"
          required
          class="w-full"
        />
      </UFormField>

      <p v-if="errorMessage" class="text-sm text-error">{{ errorMessage }}</p>

      <UButton type="submit" :loading="loading" block>
        {{ isSignup ? 'Create account' : 'Sign in' }}
      </UButton>
    </form>

    <template v-if="!needsConfirm" #footer>
      <div class="space-y-2 text-center">
        <p class="text-sm text-muted">
          {{ isSignup ? 'Already have an account?' : "Don't have an account?" }}
          <UButton variant="link" class="p-0" @click="toggleMode">
            {{ isSignup ? 'Sign in' : 'Create one' }}
          </UButton>
        </p>
        <p v-if="!isSignup">
          <UButton variant="link" color="neutral" class="p-0 text-sm" to="/forgot-password" label="Forgot password?" />
        </p>
      </div>
    </template>
  </UCard>
</template>
