-- Phase: Inbound email -> tickets (Mailgun)
-- Customers email a Mailgun route which POSTs to /api/inbound/mailgun.
-- Senders are routed to a customer by email domain (reusing customer_domains);
-- public webmail senders land in a shared "Direct" customer for staff triage.
-- Run in Supabase SQL editor (or via the Management API).

-- ============================================================
-- Catch-all customer for senders we can't route by domain
-- (gmail.com, outlook.com, ... — see PUBLIC_EMAIL_DOMAINS in server code).
-- Looked up by slug 'direct' at runtime; safe to re-run.
-- ============================================================
insert into public.customers (name, slug)
values ('Direct', 'direct')
on conflict (slug) do nothing;

-- ============================================================
-- Idempotency / audit log for inbound messages.
-- Mailgun retries on non-2xx, so we dedupe on the RFC Message-Id and never
-- create the same ticket/comment twice. Written only by the service role.
-- ============================================================
create table if not exists public.inbound_emails (
  message_id text primary key,
  ticket_id uuid references public.tickets(id) on delete set null,
  sender text,
  recipient text,
  created_at timestamptz not null default now()
);

-- Service role bypasses RLS; enabling it with no policies denies everyone else.
alter table public.inbound_emails enable row level security;
