import { serverSupabaseUser } from '#supabase/server'

type Event = 'created' | 'comment' | 'status' | 'assigned'

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_customer: 'Waiting on customer',
  resolved: 'Resolved',
  closed: 'Closed',
}

/**
 * Best-effort email notifications for ticket events. In-app notifications are
 * handled separately by DB triggers, so failures here never block the action.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ event: Event, ticketId: string, commentBody?: string }>(event)
  if (!body?.ticketId || !body?.event) {
    throw createError({ statusCode: 400, statusMessage: 'event and ticketId required' })
  }

  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const admin = useSupabaseAdmin()
  if (!admin) return { ok: false, skipped: 'no-service-key' }
  if (!isMailConfigured()) return { ok: false, skipped: 'mail-not-configured' }

  // Load the ticket + customer name (service role).
  type TicketLite = {
    id: string
    number: number
    subject: string
    status: string
    customer_id: string
    created_by: string
    assigned_to: string | null
    customer: { name: string } | null
  }
  const { data: ticketData } = await admin
    .from('tickets')
    .select('id, number, subject, status, customer_id, created_by, assigned_to, customer:customers(name)')
    .eq('id', body.ticketId)
    .single()
  const ticket = ticketData as TicketLite | null
  if (!ticket) throw createError({ statusCode: 404, statusMessage: 'Ticket not found' })

  // Authorize: caller must be staff or belong to the ticket's customer.
  const { data: caller } = await admin
    .from('profiles')
    .select('id, is_staff, customer_id, full_name')
    .eq('id', user.id)
    .single()
  const callerIsStaff = caller?.is_staff ?? false
  if (!callerIsStaff && caller?.customer_id !== ticket.customer_id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // Determine recipient ids (mirrors the in-app trigger logic).
  const staffIds = async () => {
    const { data } = await admin.from('profiles').select('id').eq('is_staff', true)
    return (data ?? []).map((p) => p.id)
  }

  let recipientIds: (string | null)[] = []
  switch (body.event) {
    case 'created':
      recipientIds = await staffIds()
      break
    case 'comment':
      recipientIds = [ticket.created_by, ticket.assigned_to]
      if (!callerIsStaff) recipientIds.push(...(await staffIds()))
      break
    case 'status':
      recipientIds = [ticket.created_by, ticket.assigned_to]
      break
    case 'assigned':
      recipientIds = [ticket.assigned_to]
      break
  }

  const uniqueIds = [...new Set(recipientIds.filter((id): id is string => !!id && id !== user.id))]
  if (!uniqueIds.length) return { ok: true, sent: 0 }

  const { data: recipients } = await admin
    .from('profiles')
    .select('id, email, is_staff, full_name')
    .in('id', uniqueIds)

  const config = useRuntimeConfig()
  const appUrl = config.public.appUrl
  const customerName = ticket.customer?.name ?? 'A customer'
  const actorName = caller?.full_name || user.email || 'Someone'
  const num = ticket.number

  let sent = 0
  await Promise.all(
    (recipients ?? []).map(async (r) => {
      if (!r.email) return
      const link = r.is_staff
        ? `${appUrl}/tickets/${ticket.id}`
        : `${appUrl}/portal/tickets/${ticket.id}`

      let subject = ''
      let content: Parameters<typeof sendNotificationEmail>[2]
      switch (body.event) {
        case 'created':
          subject = `New ticket #${num}: ${ticket.subject}`
          content = {
            heading: `New ticket #${num}`,
            lines: [`${customerName} raised a new ticket:`, `“${ticket.subject}”`],
            ctaText: 'View ticket',
            ctaUrl: link,
          }
          break
        case 'comment':
          subject = `New reply on ticket #${num}`
          content = {
            heading: `New reply on ticket #${num}`,
            lines: [`${actorName} replied to “${ticket.subject}”.`],
            quote: body.commentBody,
            ctaText: 'View ticket',
            ctaUrl: link,
          }
          break
        case 'status':
          subject = `Ticket #${num} is now ${STATUS_LABELS[ticket.status] ?? ticket.status}`
          content = {
            heading: `Ticket #${num} updated`,
            lines: [`“${ticket.subject}” is now ${STATUS_LABELS[ticket.status] ?? ticket.status}.`],
            ctaText: 'View ticket',
            ctaUrl: link,
          }
          break
        case 'assigned':
          subject = `Ticket #${num} assigned to you`
          content = {
            heading: 'A ticket was assigned to you',
            lines: [`You've been assigned ticket #${num}: “${ticket.subject}”.`],
            ctaText: 'View ticket',
            ctaUrl: link,
          }
          break
      }

      try {
        await sendNotificationEmail(r.email, subject, content!)
        sent++
      } catch (err) {
        console.error('[notify] email failed for', r.email, err)
      }
    }),
  )

  return { ok: true, sent }
})
