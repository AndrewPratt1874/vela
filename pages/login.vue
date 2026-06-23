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
const errorMessage = ref<string | null>(null)

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
      const { error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
          data: { full_name: fullName.value || undefined },
        },
      })
      if (error) throw error
      // Best-effort: alert staff that someone is awaiting approval. The profile
      // is created synchronously by the signup trigger, so it exists by now.
      $fetch('/api/notify-registration', { method: 'POST', body: { email: email.value } }).catch(() => {})
      // Email confirmation is disabled, so signup returns a session immediately.
      // The global approval guard holds the new user on /pending until staff
      // approve them.
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

    <form class="space-y-4" @submit.prevent="submit">
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

    <template #footer>
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
