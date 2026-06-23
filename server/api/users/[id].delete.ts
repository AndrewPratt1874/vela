import { serverSupabaseUser } from '#supabase/server'

/**
 * Permanently delete a user. Staff-only. Removes the auth user, which cascades
 * to the profile (profiles.id -> auth.users on delete cascade).
 *
 * Several tables reference profiles(id) with NO cascade (RESTRICT): tickets
 * (created_by), ticket_comments (author_id), projects (owner_id), issues
 * (reporter_id). If the user owns any of those, the delete would fail with an
 * opaque DB error — so we pre-check and return a clear 409 telling staff to
 * revoke access instead.
 */
export default defineEventHandler(async (event) => {
  const targetId = getRouterParam(event, 'id')
  if (!targetId) throw createError({ statusCode: 400, statusMessage: 'user id required' })

  const caller = await serverSupabaseUser(event).catch(() => null)
  if (!caller) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  if (caller.id === targetId) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot delete your own account' })
  }

  const admin = useSupabaseAdmin()
  if (!admin) throw createError({ statusCode: 500, statusMessage: 'Service key not configured' })

  // Authorize: caller must be staff.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_staff')
    .eq('id', caller.id)
    .single()
  if (!callerProfile?.is_staff) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // Pre-check content that would block the cascade.
  const blockers: { label: string, table: 'tickets' | 'ticket_comments' | 'projects' | 'issues', column: string }[] = [
    { label: 'tickets', table: 'tickets', column: 'created_by' },
    { label: 'comments', table: 'ticket_comments', column: 'author_id' },
    { label: 'projects', table: 'projects', column: 'owner_id' },
    { label: 'issues', table: 'issues', column: 'reporter_id' },
  ]
  const found: string[] = []
  for (const b of blockers) {
    const { count } = await admin
      .from(b.table)
      .select('id', { count: 'exact', head: true })
      .eq(b.column, targetId)
    if (count && count > 0) found.push(`${count} ${b.label}`)
  }
  if (found.length) {
    throw createError({
      statusCode: 409,
      statusMessage: `This user has ${found.join(', ')}. Revoke their access instead of deleting.`,
    })
  }

  const { error } = await admin.auth.admin.deleteUser(targetId)
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
