import type { Label } from '~/types/database'

/**
 * Project-scoped labels: list, create, and attach/detach to issues.
 */
export function useLabels(projectId: MaybeRefOrGetter<string | undefined>) {
  const supabase = useSupabaseClient()

  const { data: labels, refresh } = useAsyncData(
    () => `labels-${toValue(projectId) ?? 'none'}`,
    async () => {
      const id = toValue(projectId)
      if (!id) return []
      const { data } = await supabase
        .from('labels')
        .select('*')
        .eq('project_id', id)
        .order('name')
      return (data ?? []) as Label[]
    },
    { watch: [() => toValue(projectId)] },
  )

  async function createLabel(name: string, color = 'neutral') {
    const id = toValue(projectId)
    if (!id) return null
    const { data, error } = await supabase
      .from('labels')
      .insert({ project_id: id, name: name.trim(), color })
      .select()
      .single()
    if (error) throw error
    await refresh()
    return data as Label
  }

  async function setIssueLabels(issueId: string, labelIds: string[]) {
    // Replace the issue's labels with the given set.
    await supabase.from('issue_labels').delete().eq('issue_id', issueId)
    if (labelIds.length) {
      const { error } = await supabase
        .from('issue_labels')
        .insert(labelIds.map((label_id) => ({ issue_id: issueId, label_id })))
      if (error) throw error
    }
  }

  return { labels, refresh, createLabel, setIssueLabels }
}
