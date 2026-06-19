-- Tracker schema
-- Run in Supabase SQL editor (or via `supabase db push`)

-- ============================================================
-- Profiles (mirror of auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Projects
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  key text not null unique,
  description text,
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ============================================================
-- Issues
-- ============================================================
create type public.issue_status as enum ('todo', 'in_progress', 'in_review', 'done', 'cancelled');
create type public.issue_priority as enum ('low', 'medium', 'high', 'urgent');

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number integer not null,
  title text not null,
  description text,
  status public.issue_status not null default 'todo',
  priority public.issue_priority not null default 'medium',
  assignee_id uuid references public.profiles(id) on delete set null,
  reporter_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);

create index issues_project_status_idx on public.issues (project_id, status);
create index issues_project_assignee_idx on public.issues (project_id, assignee_id);

-- Auto-increment issue number per project
create or replace function public.set_issue_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1
      into new.number
      from public.issues
      where project_id = new.project_id;
  end if;
  return new;
end;
$$;

create trigger issues_set_number
  before insert on public.issues
  for each row execute function public.set_issue_number();

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger issues_set_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

-- Auto-add owner as a member when project is created
create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger projects_add_owner_member
  after insert on public.projects
  for each row execute function public.add_owner_as_member();

-- ============================================================
-- Helper: is the calling user a member of the project?
-- SECURITY DEFINER avoids recursive RLS on project_members.
-- ============================================================
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

-- ============================================================
-- Row level security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.issues enable row level security;

-- Profiles
create policy "profiles_select_all_authenticated"
  on public.profiles for select
  to authenticated using (true);

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

-- Projects
create policy "projects_select_member"
  on public.projects for select
  to authenticated using (public.is_project_member(id));

create policy "projects_insert_self_owner"
  on public.projects for insert
  to authenticated with check (owner_id = auth.uid());

create policy "projects_update_owner"
  on public.projects for update
  to authenticated using (owner_id = auth.uid());

create policy "projects_delete_owner"
  on public.projects for delete
  to authenticated using (owner_id = auth.uid());

-- Project members
create policy "members_select_if_member"
  on public.project_members for select
  to authenticated using (public.is_project_member(project_id));

create policy "members_insert_owner_or_self_first"
  on public.project_members for insert
  to authenticated with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

create policy "members_delete_owner_or_self"
  on public.project_members for delete
  to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

-- Issues
create policy "issues_select_member"
  on public.issues for select
  to authenticated using (public.is_project_member(project_id));

create policy "issues_insert_member"
  on public.issues for insert
  to authenticated with check (
    reporter_id = auth.uid() and public.is_project_member(project_id)
  );

create policy "issues_update_member"
  on public.issues for update
  to authenticated using (public.is_project_member(project_id));

create policy "issues_delete_member"
  on public.issues for delete
  to authenticated using (public.is_project_member(project_id));
