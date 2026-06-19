-- Phase 4: link an issue back to the ticket it was promoted from.
-- Run in Supabase SQL editor (or via `supabase db push`).

alter table public.issues
  add column source_ticket_id uuid references public.tickets(id) on delete set null;

create index issues_source_ticket_idx on public.issues (source_ticket_id);
