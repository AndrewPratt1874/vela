-- Phase 3: Ticket system, attachments, and notifications
-- Run in Supabase SQL editor (or via `supabase db push`).

-- ============================================================
-- Tickets (customer-facing support requests)
-- ============================================================
create type public.ticket_status as enum (
  'open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  number integer not null,
  subject text not null,
  body text,
  status public.ticket_status not null default 'open',
  priority public.issue_priority not null default 'medium',
  created_by uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, number)
);

create index tickets_customer_status_idx on public.tickets (customer_id, status);
create index tickets_assigned_idx on public.tickets (assigned_to);

-- Per-customer auto-incrementing ticket number
create or replace function public.set_ticket_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1
      into new.number
      from public.tickets
      where customer_id = new.customer_id;
  end if;
  return new;
end;
$$;

create trigger tickets_set_number
  before insert on public.tickets
  for each row execute function public.set_ticket_number();

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- ============================================================
-- Ticket comments (customer <-> staff thread)
-- ============================================================
create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);

-- ============================================================
-- Attachments (tickets now; issues/projects reused in Phase 4)
-- ============================================================
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null references public.profiles(id),
  ticket_id uuid references public.tickets(id) on delete cascade,
  issue_id uuid references public.issues(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index attachments_ticket_idx on public.attachments (ticket_id);
create index attachments_project_idx on public.attachments (project_id);
create index attachments_issue_idx on public.attachments (issue_id);

-- ============================================================
-- Notifications (in-app)
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  ticket_id uuid references public.tickets(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

-- ============================================================
-- Access helper for tickets
-- ============================================================
create or replace function public.can_access_ticket(p_ticket_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.is_staff() or exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id and t.customer_id = public.current_customer_id()
  );
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;

-- Tickets: staff manage all; customer users see + raise their own.
create policy "tickets_select"
  on public.tickets for select
  to authenticated
  using (public.is_staff() or customer_id = public.current_customer_id());

create policy "tickets_insert"
  on public.tickets for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (public.is_staff() or customer_id = public.current_customer_id())
  );

create policy "tickets_update_staff"
  on public.tickets for update
  to authenticated
  using (public.is_staff());

create policy "tickets_delete_staff"
  on public.tickets for delete
  to authenticated
  using (public.is_staff());

-- Ticket comments: visible to anyone who can see the ticket; author posts own.
create policy "ticket_comments_select"
  on public.ticket_comments for select
  to authenticated
  using (public.can_access_ticket(ticket_id));

create policy "ticket_comments_insert"
  on public.ticket_comments for insert
  to authenticated
  with check (author_id = auth.uid() and public.can_access_ticket(ticket_id));

-- Attachments: gate by the parent record.
create policy "attachments_select"
  on public.attachments for select
  to authenticated
  using (
    public.is_staff()
    or (ticket_id is not null and public.can_access_ticket(ticket_id))
    or (project_id is not null and exists (
      select 1 from public.projects p
      where p.id = project_id and p.customer_id = public.current_customer_id()
    ))
  );

create policy "attachments_insert"
  on public.attachments for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.is_staff()
      or (ticket_id is not null and public.can_access_ticket(ticket_id))
      or (project_id is not null and exists (
        select 1 from public.projects p
        where p.id = project_id and p.customer_id = public.current_customer_id()
      ))
    )
  );

create policy "attachments_delete"
  on public.attachments for delete
  to authenticated
  using (public.is_staff() or uploaded_by = auth.uid());

-- Notifications: a user sees and updates (mark-read) only their own.
-- Inserts are performed by SECURITY DEFINER triggers, so no insert policy.
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Storage bucket for attachments
-- ============================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Path convention: customers/{customer_id}/{parent}/{uuid}-{filename}
-- so folder[2] is the customer id.
create policy "attachments_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (public.is_staff() or (storage.foldername(name))[2] = public.current_customer_id()::text)
  );

create policy "attachments_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (public.is_staff() or (storage.foldername(name))[2] = public.current_customer_id()::text)
  );

create policy "attachments_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (public.is_staff() or (storage.foldername(name))[2] = public.current_customer_id()::text)
  );

-- ============================================================
-- Notification triggers (in-app). Email is sent separately by the app.
-- ============================================================
create or replace function public.notify_user(
  p_user uuid, p_actor uuid, p_type text, p_title text, p_body text, p_ticket uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, ticket_id)
  values (p_user, p_type, p_title, p_body, p_ticket);
end;
$$;

-- New ticket -> notify all staff (except the creator)
create or replace function public.on_ticket_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff record;
  v_cust text;
begin
  select name into v_cust from public.customers where id = new.customer_id;
  for v_staff in select id from public.profiles where is_staff = true loop
    perform public.notify_user(
      v_staff.id, new.created_by, 'ticket_created',
      'New ticket: ' || new.subject,
      coalesce(v_cust, 'A customer') || ' raised a ticket.',
      new.id
    );
  end loop;
  return new;
end;
$$;

create trigger tickets_notify_created
  after insert on public.tickets
  for each row execute function public.on_ticket_created();

-- Status / assignment change -> notify reporter and/or assignee
create or replace function public.on_ticket_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if new.status is distinct from old.status then
    perform public.notify_user(
      new.created_by, v_actor, 'ticket_status',
      'Ticket #' || new.number || ' is now ' || new.status,
      new.subject, new.id
    );
    if new.assigned_to is distinct from new.created_by then
      perform public.notify_user(
        new.assigned_to, v_actor, 'ticket_status',
        'Ticket #' || new.number || ' is now ' || new.status,
        new.subject, new.id
      );
    end if;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    perform public.notify_user(
      new.assigned_to, v_actor, 'ticket_assigned',
      'Assigned to you: ' || new.subject,
      'Ticket #' || new.number, new.id
    );
  end if;
  return new;
end;
$$;

create trigger tickets_notify_updated
  after update on public.tickets
  for each row execute function public.on_ticket_updated();

-- New comment -> notify the other participants
create or replace function public.on_ticket_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
  v_author_staff boolean;
  v_staff record;
begin
  select * into v_ticket from public.tickets where id = new.ticket_id;
  select is_staff into v_author_staff from public.profiles where id = new.author_id;

  -- Always notify the reporter and the assignee (notify_user skips the author)
  perform public.notify_user(
    v_ticket.created_by, new.author_id, 'ticket_comment',
    'New reply on #' || v_ticket.number, left(new.body, 140), v_ticket.id
  );
  perform public.notify_user(
    v_ticket.assigned_to, new.author_id, 'ticket_comment',
    'New reply on #' || v_ticket.number, left(new.body, 140), v_ticket.id
  );

  -- If a customer replied, make sure all staff hear about it.
  if coalesce(v_author_staff, false) = false then
    for v_staff in select id from public.profiles where is_staff = true loop
      perform public.notify_user(
        v_staff.id, new.author_id, 'ticket_comment',
        'New reply on #' || v_ticket.number, left(new.body, 140), v_ticket.id
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger ticket_comments_notify
  after insert on public.ticket_comments
  for each row execute function public.on_ticket_comment();
