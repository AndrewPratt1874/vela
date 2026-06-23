import { serverSupabaseUser } from '#supabase/server'

/**
 * Email a user that their account has been approved. Called (best-effort) from
 * the Users admin page right after a staff member approves them. Staff-only.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ userId?: string }>(event)
  const userId = body?.userId
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'userId required' })

  const caller = await serverSupabaseUser(event).catch(() => null)
  if (!caller) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const admin = useSupabaseAdmin()
  if (!admin) return { ok: false, skipped: 'no-service-key' }
  if (!isMailConfigured()) return { ok: false, skipped: 'mail-not-configured' }

  // Authorize: caller must be staff.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_staff')
    .eq('id', caller.id)
    .single()
  if (!callerProfile?.is_staff) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // Only email genuinely-approved users.
  const { data: target } = await admin
    .from('profiles')
    .select('email, full_name, status')
    .eq('id', userId)
    .maybeSingle()
  if (!target?.email || target.status !== 'approved') {
    return { ok: true, sent: 0 }
  }

  const appUrl = useRuntimeConfig().public.appUrl

  try {
    await sendNotificationEmail(target.email, 'Your Vela account is approved', {
      heading: 'You’re approved',
      lines: [
        `Hi${target.full_name ? ` ${target.full_name}` : ''}, good news — Codable has approved your Vela account.`,
        'You can now sign in and start using the app.',
      ],
      ctaText: 'Sign in to Vela',
      ctaUrl: `${appUrl}/login`,
      footnote: 'You’re receiving this because your Vela account was approved.',
    })
  } catch (err) {
    console.error('[notify-approval] email failed for', target.email, err)
    return { ok: false, sent: 0 }
  }

  return { ok: true, sent: 1 }
})
