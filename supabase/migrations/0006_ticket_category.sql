-- Add a category to tickets (Bug / Update / Feature / Task / Enquiry / Other).
-- Run in Supabase SQL editor (or via `supabase db push`).

create type public.ticket_category as enum (
  'bug', 'update', 'feature', 'task', 'enquiry', 'other'
);

alter table public.tickets
  add column category public.ticket_category not null default 'enquiry';
