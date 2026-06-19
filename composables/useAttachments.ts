import type { Attachment } from '~/types/database'

type ParentKey = 'ticket_id' | 'issue_id' | 'project_id'

interface AttachmentParent {
  customerId: string
  key: ParentKey
  id: string
}

/**
 * Upload / list / download / remove files in the private `attachments` bucket.
 * Files live under customers/{customerId}/{parent}/... so storage RLS can
 * isolate them per customer.
 */
export function useAttachments(parent: MaybeRefOrGetter<AttachmentParent | null>) {
  const supabase = useSupabaseClient()
  const BUCKET = 'attachments'

  const { data: attachments, refresh } = useAsyncData(
    () => {
      const p = toValue(parent)
      return `attachments-${p?.key}-${p?.id ?? 'none'}`
    },
    async () => {
      const p = toValue(parent)
      if (!p) return []
      const { data } = await supabase
        .from('attachments')
        .select('*')
        .eq(p.key, p.id)
        .order('created_at', { ascending: true })
      return (data ?? []) as Attachment[]
    },
    { watch: [() => toValue(parent)?.id] },
  )

  function safeName(name: string) {
    return name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  }

  async function upload(file: File) {
    const p = toValue(parent)
    const user = useSupabaseUser()
    if (!p || !user.value) throw new Error('Missing context')

    const folder = p.key.replace('_id', '') // ticket | issue | project
    const path = `customers/${p.customerId}/${folder}/${crypto.randomUUID()}-${safeName(file.name)}`

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
    if (upErr) throw upErr

    const { error: rowErr } = await supabase.from('attachments').insert({
      customer_id: p.customerId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: user.value.id,
      [p.key]: p.id,
    } as any)
    if (rowErr) {
      // Roll back the orphaned object if the row insert fails.
      await supabase.storage.from(BUCKET).remove([path])
      throw rowErr
    }
    await refresh()
  }

  async function downloadUrl(a: Attachment) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(a.storage_path, 60)
    if (error) throw error
    return data.signedUrl
  }

  async function remove(a: Attachment) {
    await supabase.storage.from(BUCKET).remove([a.storage_path])
    await supabase.from('attachments').delete().eq('id', a.id)
    await refresh()
  }

  return { attachments, refresh, upload, downloadUrl, remove }
}
