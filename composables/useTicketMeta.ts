import type { TicketStatus } from '~/types/database'

type Color = 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'error'

export interface TicketStatusMeta {
  value: TicketStatus
  label: string
  icon: string
  color: Color
}

export const TICKET_STATUSES: TicketStatusMeta[] = [
  { value: 'open', label: 'Open', icon: 'i-lucide-circle-dot', color: 'info' },
  { value: 'in_progress', label: 'In progress', icon: 'i-lucide-circle-dashed', color: 'primary' },
  { value: 'waiting_on_customer', label: 'Waiting on customer', icon: 'i-lucide-clock', color: 'warning' },
  { value: 'resolved', label: 'Resolved', icon: 'i-lucide-circle-check', color: 'success' },
  { value: 'closed', label: 'Closed', icon: 'i-lucide-circle-x', color: 'neutral' },
]

export function useTicketMeta() {
  const statusMap = Object.fromEntries(
    TICKET_STATUSES.map((s) => [s.value, s]),
  ) as Record<TicketStatus, TicketStatusMeta>
  return { TICKET_STATUSES, statusMap }
}

/** Fire-and-forget email notification for a ticket event. */
export async function notifyTicketEvent(
  ticketId: string,
  event: 'created' | 'comment' | 'status' | 'assigned',
  commentBody?: string,
) {
  try {
    await $fetch('/api/notify', { method: 'POST', body: { event, ticketId, commentBody } })
  } catch (err) {
    // Best-effort: in-app notifications still fire via DB triggers.
    console.warn('notify failed', err)
  }
}
