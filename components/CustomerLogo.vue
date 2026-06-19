<script setup lang="ts">
import type { AvatarProps } from '@nuxt/ui'

const props = defineProps<{
  name: string
  src?: string | null
  size?: AvatarProps['size']
}>()
</script>

<template>
  <UAvatar
    :src="props.src ?? undefined"
    :alt="props.name"
    :icon="props.src ? undefined : 'i-lucide-building-2'"
    :size="props.size ?? 'sm'"
    :ui="{ root: 'rounded-md bg-elevated', image: 'object-contain' }"
  />
</template>
