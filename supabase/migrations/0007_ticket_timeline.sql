-- Phase: ticket activity timeline + resolution time.
-- Run in Supabase SQL editor (or via `supabase db push`).

-- Track when a ticket was resolved/closed so we can show "open for X".
alter table public.tickets
  add column resolved_at timestamptz;

-- Set/clear resolved_at as the status moves in and out of resolved/closed.
create or replace function public.set_ticket_resolved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('resolved', 'closed')
     and (old.status is null or old.status not in ('resolved', 'closed')) then
    new.resolved_at = now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at = null;
  end if;
  return new;
end;
$$;

create trigger tickets_set_resolved_at
  before update on public.tickets
  for each row execute function public.set_ticket_resolved_at();

-- ============================================================
-- Activity log
-- ============================================================
create table public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null, -- created | status_changed | assigned | priority_changed | category_changed | commented
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at);

alter table public.ticket_events enable row level security;

create policy "ticket_events_select"
  on public.ticket_events for select
  to authenticated
  using (public.can_access_ticket(ticket_id));

-- ============================================================
-- Event logging triggers (SECURITY DEFINER; inserts bypass RLS)
-- ============================================================
create or replace function public.log_ticket_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ticket_events (ticket_id, actor_id, type, data)
  values (new.id, new.created_by, 'created', jsonb_build_object('subject', new.subject));
  return new;
end;
$$;

create trigger tickets_log_created
  after insert on public.tickets
  for each row execute function public.log_ticket_created();

create or replace function public.log_ticket_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if new.status is distinct from old.status then
    insert into public.ticket_events (ticket_id, actor_id, type, data)
    values (new.id, v_actor, 'status_changed',
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.ticket_events (ticket_id, actor_id, type, data)
    values (new.id, v_actor, 'assigned',
            jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.ticket_events (ticket_id, actor_id, type, data)
    values (new.id, v_actor, 'priority_changed',
            jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.category is distinct from old.category then
    insert into public.ticket_events (ticket_id, actor_id, type, data)
    values (new.id, v_actor, 'category_changed',
            jsonb_build_object('from', old.category, 'to', new.category));
  end if;
  return new;
end;
$$;

create trigger tickets_log_changes
  after update on public.tickets
  for each row execute function public.log_ticket_changes();

create or replace function public.log_ticket_comment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ticket_events (ticket_id, actor_id, type, data)
  values (new.ticket_id, new.author_id, 'commented', '{}'::jsonb);
  return new;
end;
$$;

create trigger ticket_comments_log_event
  after insert on public.ticket_comments
  for each row execute function public.log_ticket_comment_event();
