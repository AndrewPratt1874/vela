<script setup lang="ts">
import sanitizeHtml from 'sanitize-html'

const props = defineProps<{ html: string | null, placeholder?: string }>()

// Pure-JS sanitizer (no jsdom) so it runs identically during SSR and in the
// browser. isomorphic-dompurify pulled in jsdom, which crashes the serverless
// bundle on server-rendered loads (e.g. landing from a notification email link).
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 's', 'code', 'pre', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'hr',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
}

// Legacy rows store plain text; render those with preserved line breaks.
const looksLikeHtml = computed(() => !!props.html && /<\/?[a-z][\s\S]*>/i.test(props.html))
const clean = computed(() => sanitizeHtml(props.html || '', sanitizeOptions))
const isEmpty = computed(() => !props.html || !props.html.replace(/<[^>]*>/g, '').trim())
</script>

<template>
  <p v-if="isEmpty && placeholder" class="text-sm italic text-dimmed">{{ placeholder }}</p>
  <div v-else-if="looksLikeHtml" class="prose prose-sm dark:prose-invert max-w-none text-default" v-html="clean" />
  <p v-else class="text-sm whitespace-pre-wrap text-default">{{ html }}</p>
</template>
