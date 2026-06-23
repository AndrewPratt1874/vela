import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

let cachedTransport: Transporter | null = null

function getMailConfig() {
  return useRuntimeConfig().mail
}

export function isMailConfigured() {
  const c = getMailConfig()
  return Boolean(c?.user && c?.pass)
}

function getTransport(): Transporter | null {
  if (!isMailConfigured()) return null
  if (cachedTransport) return cachedTransport
  const c = getMailConfig()
  cachedTransport = nodemailer.createTransport({
    host: c.host,
    port: Number(c.port),
    secure: Number(c.port) === 465,
    auth: { user: c.user, pass: c.pass },
  })
  return cachedTransport
}

interface EmailContent {
  heading: string
  /** Body paragraphs (plain strings, rendered as <p>) */
  lines: string[]
  ctaText?: string
  ctaUrl?: string
  /** Optional muted quote/excerpt block (e.g. a comment body) */
  quote?: string
  /** Override the footer line (defaults to ticket-participant wording). */
  footnote?: string
}

const BRAND = '#4f46e5' // indigo-600
const INK = '#0f172a' // slate-900
const MUTED = '#64748b' // slate-500
const BORDER = '#e2e8f0' // slate-200
const BG = '#f1f5f9' // slate-100

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderLayout(content: EmailContent, appName: string) {
  const paragraphs = content.lines
    .map(
      (l) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(l)}</p>`,
    )
    .join('')

  const quoteBlock = content.quote
    ? `<div style="margin:0 0 20px;padding:12px 16px;background:${BG};border-left:3px solid ${BORDER};border-radius:6px;font-size:14px;line-height:1.6;color:${MUTED};white-space:pre-wrap;">${escapeHtml(content.quote)}</div>`
    : ''

  const cta =
    content.ctaText && content.ctaUrl
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 4px;">
           <tr><td style="border-radius:8px;background:${BRAND};">
             <a href="${content.ctaUrl}" target="_blank"
                style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
               ${escapeHtml(content.ctaText)}
             </a>
           </td></tr>
         </table>`
      : ''

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${BG};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG};padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0"
               style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:20px 28px;border-bottom:1px solid ${BORDER};">
              <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                <td style="vertical-align:middle;">
                  <img src="cid:logo" width="28" height="28" alt="${escapeHtml(appName)}"
                       style="display:block;border-radius:6px;" />
                </td>
                <td style="vertical-align:middle;padding-left:10px;font-size:16px;font-weight:700;color:${INK};">
                  ${escapeHtml(appName)}
                </td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 16px;font-size:19px;line-height:1.4;color:${INK};">${escapeHtml(content.heading)}</h1>
              ${paragraphs}
              ${quoteBlock}
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;border-top:1px solid ${BORDER};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">
                ${escapeHtml(content.footnote ?? `You're receiving this because you're a participant on this ticket in ${appName}.`)}
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

interface SendOptions {
  /** Reply-To header — used to thread email replies back onto a ticket. */
  replyTo?: string
  /** Stable Message-Id for this mail, so replies' In-Reply-To can match it. */
  messageId?: string
}

export async function sendNotificationEmail(
  to: string, subject: string, content: EmailContent, options: SendOptions = {},
) {
  const transport = getTransport()
  if (!transport) return { sent: false, reason: 'mail-not-configured' }

  const config = useRuntimeConfig()
  const appName = config.public.appName
  const appUrl = config.public.appUrl
  const from = `"${config.mail.fromName}" <${config.mail.from}>`

  await transport.sendMail({
    from,
    to,
    subject,
    replyTo: options.replyTo,
    messageId: options.messageId,
    html: renderLayout(content, appName),
    attachments: [
      // Server fetches its own /logo.png and inlines it (works in dev + prod).
      { filename: 'logo.png', path: `${appUrl}/logo.png`, cid: 'logo' },
    ],
  })
  return { sent: true }
}

/**
 * Per-ticket Reply-To address (ticket+<id>@<inbound-domain>). Returns undefined
 * when no inbound domain is configured, so outbound mail simply omits it.
 */
export function ticketReplyTo(ticketId: string): string | undefined {
  const domain = useRuntimeConfig().mailgun.inboundDomain
  return domain ? `ticket+${ticketId}@${domain}` : undefined
}
