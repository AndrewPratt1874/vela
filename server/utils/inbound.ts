import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Public webmail providers. Domain-based customer routing is meaningless for
 * these (countless unrelated people share gmail.com), so senders on these
 * domains are funnelled to the shared "Direct" customer instead of minting a
 * per-domain customer.
 */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk',
  'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com',
  'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com',
  'zoho.com', 'mail.com', 'pm.me', 'fastmail.com',
])

export function isPublicDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase())
}

export function domainOf(email: string): string {
  return email.split('@')[1]?.toLowerCase().trim() ?? ''
}

/**
 * Verify a Mailgun inbound POST is genuine. Mailgun signs every request with
 * HMAC-SHA256(timestamp + token) keyed by the account's webhook signing key.
 * Constant-time compare; reject obviously-stale timestamps to blunt replay.
 */
export function verifyMailgunSignature(
  params: { timestamp?: string, token?: string, signature?: string },
  signingKey: string,
): boolean {
  const { timestamp, token, signature } = params
  if (!signingKey || !timestamp || !token || !signature) return false

  // Reject timestamps more than 15 minutes from now (replay guard).
  const skew = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(skew) || skew > 15 * 60) return false

  const expected = createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Pull a clean email + optional display name out of a "Name <a@b.com>" header. */
export function parseAddress(raw: string | undefined | null): { email: string, name: string | null } | null {
  if (!raw) return null
  const angle = raw.match(/<([^>]+)>/)
  const email = (angle ? angle[1] : raw).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  let name: string | null = null
  if (angle) {
    name = raw.slice(0, raw.indexOf('<')).trim().replace(/^["']|["']$/g, '') || null
  }
  return { email, name }
}

/**
 * When a staff member forwards a customer's email to the inbound mailbox, the
 * SMTP sender is the staff member. We dig the original sender out of the
 * forwarded header block (Gmail / Outlook / Apple Mail) — but only ever as an
 * UNVERIFIED suggestion for staff to confirm (see forwardNote). It is never
 * used to route or attribute, because the body is attacker-controlled text.
 *
 * Returns the first `From:` address in the body that isn't the forwarder.
 */
export function parseForwardedSender(
  body: string | undefined | null,
  forwarderEmail: string,
): { email: string, name: string | null } | null {
  if (!body) return null
  // Match "From: Jane Doe <jane@acme.com>" (and localized "De:"/"Von:" headers).
  const re = /^\s*(?:from|de|von|fra|van)\s*:\s*(.+)$/gim
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const parsed = parseAddress(m[1])
    if (parsed && parsed.email !== forwarderEmail.toLowerCase()) return parsed
  }
  return null
}

/** Extract a ticket id from a `ticket+<uuid>@…` reply address or our Message-Id. */
const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
export function ticketIdFromReply(recipient?: string, inReplyTo?: string, references?: string): string | null {
  for (const raw of [recipient, inReplyTo, references]) {
    if (!raw) continue
    // Reply-To plus-address (ticket+<id>@domain) or Message-Id (<ticket.<id>.…@domain>)
    const m = raw.match(/ticket[+.]/i) ? raw.match(UUID) : null
    if (m) return m[1].toLowerCase()
  }
  return null
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ENTITIES[c])
}

/**
 * A visible, escaped banner prepended to a forwarded ticket's body, surfacing
 * the (unverified) original sender so staff can reassign the ticket to the right
 * customer. Deliberately not a routing/identity decision — just a hint.
 */
export function forwardNote(
  forwardedBy: string, suggested: { email: string, name: string | null },
): string {
  const who = suggested.name ? `${suggested.name} <${suggested.email}>` : suggested.email
  return textToHtml(
    `↪ Forwarded by ${forwardedBy}. Suggested original sender (unverified): ${who}. `
    + 'Reassign this ticket to the correct customer if needed.',
  )
}

/** Convert a plain-text email body into the sanitised HTML the app renders. */
export function textToHtml(text: string | undefined | null): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Build a filesystem-safe storage segment from an arbitrary filename. */
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 120) || 'file'
}

/** "acme.com" -> "acme-com"; used as a fallback customer slug seed. */
export function slugifyDomain(domain: string): string {
  return domain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'customer'
}

/**
 * The `From` address is trivially spoofable, so we lean on the SPF/DKIM results
 * Mailgun computed when it received the message. We only DISTRUST on an explicit
 * `fail` — `pass`, `neutral`, `none` and "no signal" all stay trusted, so a
 * provider that doesn't surface results doesn't break inbound.
 *
 * Reads Mailgun's flattened header fields and, as a fallback, the JSON
 * `message-headers` array (Received-SPF / Authentication-Results).
 */
export function senderAuthTrusted(fields: Record<string, string>): boolean {
  const blob = [
    fields['X-Mailgun-Spf'],
    fields['Received-SPF'],
    fields['Authentication-Results'],
    fields['message-headers'],
  ].filter(Boolean).join('\n').toLowerCase()
  if (!blob) return true
  // Explicit authentication failures only.
  return !(/spf=fail|dkim=fail|received-spf:\s*fail|\bspf\b[^\n]*\bfail/.test(blob))
}
