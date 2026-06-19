<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const props = withDefaults(defineProps<{ modelValue?: string | null, placeholder?: string }>(), {
  modelValue: '',
  placeholder: 'Write something…',
})
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [StarterKit.configure({ link: { openOnClick: false } })],
  editorProps: {
    attributes: {
      class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[120px] px-3 py-2',
    },
  },
  onUpdate: () => emit('update:modelValue', editor.value?.getHTML() ?? ''),
})

// Keep editor in sync when the bound value changes externally (e.g. reset).
watch(
  () => props.modelValue,
  (val) => {
    if (editor.value && (val || '') !== editor.value.getHTML()) {
      editor.value.commands.setContent(val || '', { emitUpdate: false })
    }
  },
)

onBeforeUnmount(() => editor.value?.destroy())

function setLink() {
  if (!editor.value) return
  const prev = editor.value.getAttributes('link').href as string | undefined
  const url = window.prompt('Link URL', prev ?? 'https://')
  if (url === null) return
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

interface ToolBtn { icon: string, title: string, run: () => void, active?: () => boolean }
const buttons = computed<ToolBtn[]>(() => {
  const e = editor.value
  if (!e) return []
  return [
    { icon: 'i-lucide-bold', title: 'Bold', run: () => e.chain().focus().toggleBold().run(), active: () => e.isActive('bold') },
    { icon: 'i-lucide-italic', title: 'Italic', run: () => e.chain().focus().toggleItalic().run(), active: () => e.isActive('italic') },
    { icon: 'i-lucide-underline', title: 'Underline', run: () => e.chain().focus().toggleUnderline().run(), active: () => e.isActive('underline') },
    { icon: 'i-lucide-strikethrough', title: 'Strikethrough', run: () => e.chain().focus().toggleStrike().run(), active: () => e.isActive('strike') },
    { icon: 'i-lucide-heading', title: 'Heading', run: () => e.chain().focus().toggleHeading({ level: 3 }).run(), active: () => e.isActive('heading', { level: 3 }) },
    { icon: 'i-lucide-list', title: 'Bullet list', run: () => e.chain().focus().toggleBulletList().run(), active: () => e.isActive('bulletList') },
    { icon: 'i-lucide-list-ordered', title: 'Numbered list', run: () => e.chain().focus().toggleOrderedList().run(), active: () => e.isActive('orderedList') },
    { icon: 'i-lucide-code', title: 'Code', run: () => e.chain().focus().toggleCode().run(), active: () => e.isActive('code') },
    { icon: 'i-lucide-quote', title: 'Quote', run: () => e.chain().focus().toggleBlockquote().run(), active: () => e.isActive('blockquote') },
    { icon: 'i-lucide-link', title: 'Link', run: setLink, active: () => e.isActive('link') },
  ]
})
</script>

<template>
  <div class="rounded-lg border border-default focus-within:border-primary transition bg-default">
    <div v-if="editor" class="flex flex-wrap items-center gap-0.5 border-b border-default px-1.5 py-1">
      <UButton
        v-for="b in buttons"
        :key="b.title"
        :icon="b.icon"
        :title="b.title"
        size="xs"
        square
        variant="ghost"
        :color="b.active?.() ? 'primary' : 'neutral'"
        @click="b.run"
      />
    </div>
    <EditorContent :editor="editor" />
  </div>
</template>
