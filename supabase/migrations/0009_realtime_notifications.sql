-- Enable Supabase Realtime for in-app notifications so the bell updates live.
-- Without this, postgres_changes INSERTs are never broadcast to clients.
-- Run in Supabase SQL editor (or via `supabase db push`).

alter publication supabase_realtime add table public.notifications;
