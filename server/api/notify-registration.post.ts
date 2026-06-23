/**
 * Best-effort email to staff when a new user registers and is awaiting
 * approval. Called (unauthenticated) from the signup flow — a new user has no
 * session yet if email confirmation is on. Abuse is bounded: we only ever email
 * staff, and only after confirming a real *pending* profile exists for the
 * given email. In-app notifications are handled by a DB trigger.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string }>(event)
  const email = body?.email?.trim().toLowerCase()
  if (!email) throw createError({ statusCode: 400, statusMessage: 'email required' })

  const admin = useSupabaseAdmin()
  if (!admin) return { ok: false, skipped: 'no-service-key' }
  if (!isMailConfigured()) return { ok: false, skipped: 'mail-not-configured' }

  // Only proceed for a genuine pending (non-staff) signup.
  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name, status, is_staff')
    .eq('email', email)
    .maybeSingle()
  if (!profile || profile.is_staff || profile.status !== 'pending') {
    return { ok: true, sent: 0 }
  }

  // Acknowledge the new user: their account is awaiting approval.
  if (profile.email) {
    try {
      await sendNotificationEmail(profile.email, 'We’ve received your registration', {
        heading: 'Thanks for signing up',
        lines: [
          `Hi${profile.full_name ? ` ${profile.full_name}` : ''}, thanks for registering for Vela.`,
          'Your account is pending approval — someone at Codable will review it shortly. We’ll email you as soon as it’s approved, and then you can sign in.',
        ],
        footnote: 'You’re receiving this because you registered for a Vela account.',
      })
    } catch (err) {
      console.error('[notify-registration] welcome email failed for', profile.email, err)
    }
  }

  const { data: staff } = await admin
    .from('profiles')
    .select('email')
    .eq('is_staff', true)
    .eq('status', 'approved')
  const recipients = (staff ?? []).map((s) => s.email).filter((e): e is string => !!e)
  if (!recipients.length) return { ok: true, sent: 0 }

  const appUrl = useRuntimeConfig().public.appUrl
  const who = profile.full_name || profile.email || 'A new user'

  let sent = 0
  await Promise.all(
    recipients.map(async (to) => {
      try {
        await sendNotificationEmail(to, `New registration awaiting approval: ${who}`, {
          heading: 'New user awaiting approval',
          lines: [
            `${who}${profile.email ? ` (${profile.email})` : ''} just registered and needs approval before they can access the app.`,
          ],
          ctaText: 'Review pending users',
          ctaUrl: `${appUrl}/users`,
        })
        sent++
      } catch (err) {
        console.error('[notify-registration] email failed for', to, err)
      }
    }),
  )

  return { ok: true, sent }
})
