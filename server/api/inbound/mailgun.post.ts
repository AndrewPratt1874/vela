import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database'

type Admin = SupabaseClient<Database>

/**
 * Inbound email -> ticket. Mailgun route POSTs each message here.
 *
 * Flow: verify signature -> dedupe -> identify the verified sender -> route to a
 * customer by email domain (staff forwards + SPF/DKIM failures go to Direct
 * triage) -> thread onto an existing ticket or open a new one -> store
 * attachments -> notify.
 *
 * Everything runs with the service-role client (no auth session on a webhook),
 * so we re-implement the access rules here rather than relying on RLS.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const admin = useSupabaseAdmin()
  if (!admin) throw createError({ statusCode: 503, statusMessage: 'Service role not configured' })

  // ---- Parse the form (multipart when attachments are present) -------------
  const { fields, files } = await readInbound(event)

  // ---- Authenticate the request --------------------------------------------
  if (!verifyMailgunSignature(
    { timestamp: fields.timestamp, token: fields.token, signature: fields.signature },
    config.mailgun.signingKey,
  )) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  // ---- Idempotency: claim the Message-Id before doing any work --------------
  const messageId = fields['Message-Id'] || fields['message-id']
    || `synthetic-${fields.timestamp}-${fields.sender}`
  const { error: claimErr } = await admin
    .from('inbound_emails')
    .insert({ message_id: messageId, sender: fields.sender, recipient: fields.recipient })
  if (claimErr) {
    // Unique violation => Mailgun retried a message we already handled.
    if (claimErr.code === '23505') return { ok: true, duplicate: true }
    throw createError({ statusCode: 500, statusMessage: 'Could not record message' })
  }

  try {
    // ---- Identify the sender -----------------------------------------------
    // Routing and attribution use ONLY the verified SMTP sender. When staff
    // forward an external email, the forwarded-body From is parsed solely as an
    // unverified suggestion (forwardNote) — never trusted for routing/identity.
    const smtp = parseAddress(fields.sender) ?? parseAddress(fields.from)
    if (!smtp) throw createError({ statusCode: 422, statusMessage: 'No usable sender' })
    const sender = smtp

    const body = fields['stripped-text'] || fields['body-plain'] || ''
    const senderIsStaff = await isStaffSender(admin, sender.email)
    const forwardedFrom = senderIsStaff
      ? parseForwardedSender(fields['body-plain'] || body, sender.email)
      : null

    // ---- Route to a customer + resolve the contact profile -----------------
    // Staff-forwarded mail, and any From that fails SPF/DKIM, lands in the Direct
    // triage bucket for staff to reassign — never straight into a customer tenant.
    const trusted = senderAuthTrusted(fields)
    if (!trusted) console.warn(`[inbound] ${sender.email} failed SPF/DKIM; routing to Direct for triage`)
    const customerId = (trusted && !senderIsStaff)
      ? await resolveCustomer(admin, sender.email)
      : await directCustomerId(admin)
    const contactId = await findOrCreateContact(admin, sender.email, sender.name)
    const { data: contact } = await admin
      .from('profiles').select('customer_id, is_staff').eq('id', contactId).single()

    // ---- Thread onto an existing ticket, or open a new one -----------------
    // The reply token (ticket+<id>@…) is *routing*, not authorization: it ships
    // in every notification's Reply-To and can be forwarded/leaked. Only thread
    // the comment if the sender is actually a participant on that ticket
    // (mirrors tickets RLS: reporter/assignee, same-customer, or staff).
    // Otherwise the message becomes a new ticket under the sender's own routing.
    const threadId = ticketIdFromReply(fields.recipient, fields['In-Reply-To'], fields.References)
    let ticketId: string
    let isNew = false

    const candidate = threadId
      ? (await admin.from('tickets')
          .select('id, customer_id, created_by, assigned_to').eq('id', threadId).maybeSingle()).data
      : null
    const authorized = trusted && !!candidate && (
      contactId === candidate.created_by
      || contactId === candidate.assigned_to
      || (contact?.is_staff ?? false)
      || (!!contact?.customer_id && contact.customer_id === candidate.customer_id)
    )
    if (candidate && !authorized) {
      console.warn(`[inbound] sender ${sender.email} not authorized to reply to ticket ${candidate.id}; opening new ticket`)
    }
    const existing = authorized ? candidate : null

    if (existing) {
      ticketId = existing.id
      await admin.from('ticket_comments').insert({
        ticket_id: ticketId,
        author_id: contactId,
        body: textToHtml(body) || '(empty message)',
      })
    } else {
      isNew = true
      const ticketBody = textToHtml(fields['body-plain'] || body)
      const note = forwardedFrom ? forwardNote(sender.name ?? sender.email, forwardedFrom) : ''
      const { data: ticket, error } = await admin
        .from('tickets')
        .insert({
          customer_id: customerId,
          subject: (fields.subject || '').trim() || '(no subject)',
          body: (note + ticketBody) || null,
          category: 'enquiry',
          priority: 'medium',
          created_by: contactId,
        })
        .select('id')
        .single()
      if (error || !ticket) throw error ?? new Error('Ticket insert failed')
      ticketId = ticket.id
    }

    // ---- Store attachments on the ticket's customer ------------------------
    const ticketCustomerId = existing?.customer_id ?? customerId
    await storeAttachments(admin, files, ticketCustomerId, ticketId, contactId)

    await admin.from('inbound_emails').update({ ticket_id: ticketId }).eq('message_id', messageId)

    // ---- Notify (best effort; in-app notifications fire from DB triggers) ---
    await notifyInbound(admin, config, ticketId, isNew, textToHtml(body) || '', contactId).catch((e) => {
      console.error('[inbound] notify failed', e)
    })

    return { ok: true, ticketId, isNew }
  } catch (err) {
    // Release the claim so Mailgun's retry gets another go at it.
    await admin.from('inbound_emails').delete().eq('message_id', messageId)
    throw err
  }
})

// ----------------------------------------------------------------------------
// Form parsing
// ----------------------------------------------------------------------------
interface InboundFile { filename: string, type: string | undefined, data: Buffer }

async function readInbound(event: any): Promise<{ fields: Record<string, string>, files: InboundFile[] }> {
  const contentType = getHeader(event, 'content-type') || ''
  const fields: Record<string, string> = {}
  const files: InboundFile[] = []

  if (contentType.includes('multipart/form-data')) {
    const parts = (await readMultipartFormData(event)) || []
    for (const part of parts) {
      if (part.filename) {
        files.push({ filename: part.filename, type: part.type, data: part.data })
      } else if (part.name) {
        fields[part.name] = part.data.toString('utf8')
      }
    }
  } else {
    // application/x-www-form-urlencoded
    const body = await readBody<Record<string, string>>(event)
    Object.assign(fields, body || {})
  }
  return { fields, files }
}

// ----------------------------------------------------------------------------
// Sender / routing
// ----------------------------------------------------------------------------
async function isStaffSender(admin: Admin, email: string): Promise<boolean> {
  const domain = domainOf(email)
  if (domain) {
    const { data: sd } = await admin.from('staff_domains').select('domain').eq('domain', domain).maybeSingle()
    if (sd) return true
  }
  const { data: p } = await admin.from('profiles').select('is_staff').ilike('email', email).maybeSingle()
  return p?.is_staff ?? false
}

/** The shared catch-all customer (webmail + untrusted senders) for staff triage. */
async function directCustomerId(admin: Admin): Promise<string> {
  const { data } = await admin.from('customers').select('id').eq('slug', 'direct').single()
  if (!data) throw new Error('Direct customer missing — run migration 0011')
  return data.id
}

/** Pick the customer this sender's ticket belongs to (provisioning as needed). */
async function resolveCustomer(admin: Admin, email: string): Promise<string> {
  const domain = domainOf(email)

  if (!domain || isPublicDomain(domain)) {
    return directCustomerId(admin)
  }

  const { data: mapped } = await admin
    .from('customer_domains').select('customer_id').eq('domain', domain).maybeSingle()
  if (mapped) return mapped.customer_id

  // New corporate domain: stand up a customer and register the domain so future
  // mail (and signups) route here automatically.
  let customerId: string | null = null
  const base = slugifyDomain(domain)
  for (let attempt = 0; attempt < 4 && !customerId; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomUUID().slice(0, 4)}`
    const { data, error } = await admin
      .from('customers').insert({ name: domain, slug }).select('id').single()
    if (data) customerId = data.id
    else if (error && error.code !== '23505') throw error
  }
  if (!customerId) throw new Error('Could not create customer for ' + domain)

  await admin.from('customer_domains').insert({ domain, customer_id: customerId })
  return customerId
}

/**
 * Find the sender's profile, or provision one. Creating the auth user fires the
 * handle_new_user trigger, which sets the profile's customer_id from the domain
 * mapping (corporate) or leaves it null (public webmail) — so the contact only
 * ever sees their own company's tickets, never the shared Direct bucket.
 *
 * The email From is spoofable, so the account is created UNCONFIRMED and with no
 * password: it captures who a ticket is from, but grants no access until the
 * real owner confirms the address (and staff approve). createUser does not send
 * a confirmation email — staff invite/approve through the existing flow.
 */
async function findOrCreateContact(admin: Admin, email: string, name: string | null): Promise<string> {
  const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: false, // unproven sender — keep the account unusable
    user_metadata: name ? { full_name: name } : undefined,
  })
  if (created?.user) return created.user.id

  // Lost a race (or the user already existed) — re-read.
  const { data: again } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (again) return again.id
  throw error ?? new Error('Could not provision contact for ' + email)
}

// ----------------------------------------------------------------------------
// Attachments
// ----------------------------------------------------------------------------
async function storeAttachments(
  admin: Admin, files: InboundFile[], customerId: string, ticketId: string, uploadedBy: string,
) {
  for (const f of files) {
    const path = `customers/${customerId}/ticket/${randomUUID()}-${safeFileName(f.filename)}`
    const { error: upErr } = await admin.storage
      .from('attachments').upload(path, f.data, { contentType: f.type || undefined })
    if (upErr) {
      console.error('[inbound] attachment upload failed', f.filename, upErr)
      continue
    }
    await admin.from('attachments').insert({
      customer_id: customerId,
      storage_path: path,
      file_name: f.filename,
      mime_type: f.type || null,
      size_bytes: f.data.length,
      uploaded_by: uploadedBy,
      ticket_id: ticketId,
    })
  }
}

// ----------------------------------------------------------------------------
// Email notifications (in-app notifications are handled by DB triggers)
// ----------------------------------------------------------------------------
async function notifyInbound(
  admin: Admin, config: ReturnType<typeof useRuntimeConfig>,
  ticketId: string, isNew: boolean, commentHtml: string, authorId: string,
) {
  if (!isMailConfigured()) return

  type TicketLite = {
    id: string
    number: number
    subject: string
    created_by: string
    assigned_to: string | null
    customer: { name: string } | null
  }
  const { data: ticketData } = await admin
    .from('tickets')
    .select('id, number, subject, created_by, assigned_to, customer:customers(name)')
    .eq('id', ticketId)
    .single()
  const ticket = ticketData as TicketLite | null
  if (!ticket) return

  // New ticket -> all staff. Reply -> the ticket's reporter, assignee + staff.
  const ids = new Set<string>()
  const { data: staff } = await admin.from('profiles').select('id').eq('is_staff', true).eq('status', 'approved')
  for (const s of staff ?? []) ids.add(s.id)
  if (!isNew) {
    if (ticket.created_by) ids.add(ticket.created_by)
    if (ticket.assigned_to) ids.add(ticket.assigned_to)
  }
  // Whoever sent this message shouldn't be emailed about it.
  ids.delete(authorId)

  if (!ids.size) return
  const { data: recipients } = await admin.from('profiles').select('email, is_staff').in('id', [...ids])

  const appUrl = config.public.appUrl
  const customerName = (ticket.customer as { name: string } | null)?.name ?? 'Someone'
  const num = ticket.number

  await Promise.all((recipients ?? []).map(async (r) => {
    if (!r.email) return
    const link = `${appUrl}${r.is_staff ? '' : '/portal'}/tickets/${ticket.id}`
    const subject = isNew
      ? `New ticket #${num} (via email): ${ticket.subject}`
      : `New reply on ticket #${num}`
    const content = isNew
      ? {
          heading: `New ticket #${num} via email`,
          lines: [`${customerName} emailed in a new ticket:`, `“${ticket.subject}”`],
          ctaText: 'View ticket', ctaUrl: link,
        }
      : {
          heading: `New reply on ticket #${num}`,
          lines: [`A new reply arrived by email on “${ticket.subject}”.`],
          quote: stripHtml(commentHtml), ctaText: 'View ticket', ctaUrl: link,
        }
    await sendNotificationEmail(r.email, subject, content, { replyTo: ticketReplyTo(ticket.id) }).catch((e) =>
      console.error('[inbound] email failed for', r.email, e))
  }))
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280)
}
