import type { PersonRef } from '~/types/database'

/**
 * Candidate assignees for a project's issues: everyone attached to the project
 * (project_members) plus all approved staff. The tracker is internal and staff
 * can access every project (see can_access_project), so any staff member can be
 * assigned to any project's issues. Deduped and sorted by name.
 */
export async function useProjectAssignees(projectId: string) {
  const supabase = useSupabaseClient()
  const { data, refresh, pending } = await useAsyncData(`project-assignees-${projectId}`, async () => {
    const [membersRes, staffRes] = await Promise.all([
      supabase
        .from('project_members')
        .select('profile:profiles(id, full_name, email, avatar_url)')
        .eq('project_id', projectId),
      supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('is_staff', true)
        .eq('status', 'approved'),
    ])
    const people = [
      ...((membersRes.data ?? []).map((m: any) => m.profile).filter(Boolean) as PersonRef[]),
      ...((staffRes.data ?? []) as PersonRef[]),
    ]
    const byId = new Map<string, PersonRef>()
    for (const p of people) if (p?.id) byId.set(p.id, p)
    return [...byId.values()].sort((a, b) =>
      (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? ''),
    )
  })
  return { assignees: data, refresh, pending }
}
