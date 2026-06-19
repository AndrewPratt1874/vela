-- Phase 2: Issue tracker upgrade
-- Adds type, resolution, due date, estimate, and labels to issues.
-- Run in Supabase SQL editor (or via `supabase db push`).

-- ============================================================
-- Issue type (matches the spreadsheet's Bug / Feature / Task column)
-- ============================================================
create type public.issue_type as enum ('bug', 'feature', 'task', 'improvement');

alter table public.issues
  add column type public.issue_type not null default 'task',
  add column resolution text,
  add column due_date date,
  add column estimate numeric;

-- ============================================================
-- Labels (project-scoped, GitHub/Linear style)
-- ============================================================
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  color text not null default 'neutral',
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table public.issue_labels (
  issue_id uuid not null references public.issues(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (issue_id, label_id)
);

create index labels_project_idx on public.labels (project_id);
create index issue_labels_label_idx on public.issue_labels (label_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.labels enable row level security;
alter table public.issue_labels enable row level security;

-- Helper: does the calling user have staff or member access to a project?
create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.is_staff() or public.is_project_member(p_project_id);
$$;

-- Issues: give staff full access (the tracker is internal); keep member access.
drop policy if exists "issues_select_member" on public.issues;
drop policy if exists "issues_insert_member" on public.issues;
drop policy if exists "issues_update_member" on public.issues;
drop policy if exists "issues_delete_member" on public.issues;

create policy "issues_select"
  on public.issues for select
  to authenticated
  using (public.can_access_project(project_id));

create policy "issues_insert"
  on public.issues for insert
  to authenticated
  with check (reporter_id = auth.uid() and public.can_access_project(project_id));

create policy "issues_update"
  on public.issues for update
  to authenticated
  using (public.can_access_project(project_id));

create policy "issues_delete"
  on public.issues for delete
  to authenticated
  using (public.can_access_project(project_id));

-- Labels
create policy "labels_select"
  on public.labels for select
  to authenticated
  using (public.can_access_project(project_id));

create policy "labels_write"
  on public.labels for all
  to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

-- Issue labels (gate via the parent issue's project)
create policy "issue_labels_select"
  on public.issue_labels for select
  to authenticated
  using (
    exists (
      select 1 from public.issues i
      where i.id = issue_id and public.can_access_project(i.project_id)
    )
  );

create policy "issue_labels_write"
  on public.issue_labels for all
  to authenticated
  using (
    exists (
      select 1 from public.issues i
      where i.id = issue_id and public.can_access_project(i.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.issues i
      where i.id = issue_id and public.can_access_project(i.project_id)
    )
  );
