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
          Track projects and issues, and keep your customers in the loop.
        </p>
      </div>
    </template>

    <div v-if="needsConfirm" class="space-y-2 text-center py-4">
      <UIcon name="i-lucide-mail-check" class="text-primary size-10 mx-auto" />
      <p class="font-medium">Confirm your email</p>
      <p class="text-sm text-muted">
        We sent a confirmation link to <strong>{{ email }}</strong>. Click it to finish creating your account.
      </p>
      <div class="pt-2">
        <UButton
          variant="subtle"
          icon="i-lucide-rotate-cw"
          :loading="resending"
          label="Resend confirmation email"
          @click="resendConfirmation"
        />
        <p class="text-xs text-dimmed mt-2">
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

      <UFormField name="password" required>
        <template #label>
          <div class="flex items-center justify-between">
            <span>Password</span>
            <UButton
              v-if="!isSignup"
              variant="link"
              class="p-0 text-xs"
              to="/forgot-password"
              label="Forgot password?"
            />
          </div>
        </template>
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
      <p class="text-sm text-center text-muted">
        {{ isSignup ? 'Already have an account?' : "Don't have an account?" }}
        <UButton variant="link" class="p-0" @click="toggleMode">
          {{ isSignup ? 'Sign in' : 'Create one' }}
        </UButton>
      </p>
    </template>
  </UCard>
</template>
