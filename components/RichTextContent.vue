<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'

const props = defineProps<{ html: string | null, placeholder?: string }>()

// Legacy rows store plain text; render those with preserved line breaks.
const looksLikeHtml = computed(() => !!props.html && /<\/?[a-z][\s\S]*>/i.test(props.html))
const clean = computed(() => DOMPurify.sanitize(props.html || '', { USE_PROFILES: { html: true } }))
const isEmpty = computed(() => !props.html || !props.html.replace(/<[^>]*>/g, '').trim())
</script>

<template>
  <p v-if="isEmpty && placeholder" class="text-sm italic text-dimmed">{{ placeholder }}</p>
  <div v-else-if="looksLikeHtml" class="prose prose-sm dark:prose-invert max-w-none text-default" v-html="clean" />
  <p v-else class="text-sm whitespace-pre-wrap text-default">{{ html }}</p>
</template>
