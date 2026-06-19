<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const user = useSupabaseUser()

watch(
  user,
  (value) => {
    if (value) navigateTo('/')
  },
  { immediate: true },
)
</script>

<template>
  <UCard>
    <div class="flex items-center gap-3 py-4">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-5 text-primary" />
      <span>Signing you in…</span>
    </div>
  </UCard>
</template>
