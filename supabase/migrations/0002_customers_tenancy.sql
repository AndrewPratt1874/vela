-- Phase 1: Customer multi-tenancy foundation
-- Adds customers + email-domain allocation, staff flag, and scopes projects
-- to a customer. Run in Supabase SQL editor (or via `supabase db push`).

-- ============================================================
-- Customers + domain allocation
-- ============================================================
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- A customer can own multiple email domains (acme.com, acme.co.uk, ...)
create table public.customer_domains (
  domain text primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Internal staff domains: any signup on these becomes staff (sees everything).
create table public.staff_domains (
  domain text primary key,
  created_at timestamptz not null default now()
);

insert into public.staff_domains (domain) values ('codable.online')
  on conflict do nothing;

-- ============================================================
-- Profiles: tenancy columns
-- ============================================================
alter table public.profiles
  add column customer_id uuid references public.customers(id) on delete set null,
  add column is_staff boolean not null default false;

-- Backfill: existing users on a staff domain become staff (so current
-- accounts keep full access after this migration).
update public.profiles p
set is_staff = true
where lower(split_part(coalesce(p.email, ''), '@', 2))
      in (select domain from public.staff_domains);

-- ============================================================
-- Rewrite signup handler to allocate by email domain
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text;
  v_customer_id uuid;
  v_is_staff boolean := false;
begin
  v_domain := lower(split_part(new.email, '@', 2));

  select customer_id into v_customer_id
    from public.customer_domains
    where domain = v_domain;

  if v_customer_id is null then
    select true into v_is_staff
      from public.staff_domains
      where domain = v_domain;
    v_is_staff := coalesce(v_is_staff, false);
  end if;

  insert into public.profiles (id, email, full_name, customer_id, is_staff)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_customer_id,
    v_is_staff
  );
  return new;
end;
$$;

-- ============================================================
-- Projects: scope to a customer
-- Nullable so existing rows survive; the app requires it on create.
-- ============================================================
alter table public.projects
  add column customer_id uuid references public.customers(id) on delete cascade;

create index projects_customer_idx on public.projects (customer_id);

-- ============================================================
-- RLS helpers (SECURITY DEFINER to avoid recursive policy reads)
-- ============================================================
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select is_staff from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select customer_id from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.customers enable row level security;
alter table public.customer_domains enable row level security;
alter table public.staff_domains enable row level security;

-- Customers: staff manage all; a customer user can see only their own.
create policy "customers_select"
  on public.customers for select
  to authenticated
  using (public.is_staff() or id = public.current_customer_id());

create policy "customers_staff_write"
  on public.customers for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Customer domains: staff manage; customer users may read their own.
create policy "customer_domains_select"
  on public.customer_domains for select
  to authenticated
  using (public.is_staff() or customer_id = public.current_customer_id());

create policy "customer_domains_staff_write"
  on public.customer_domains for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Staff domains: staff only.
create policy "staff_domains_staff_all"
  on public.staff_domains for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ============================================================
-- Tighten profile visibility for tenancy
-- (self, same-customer, or staff sees all)
-- ============================================================
drop policy if exists "profiles_select_all_authenticated" on public.profiles;
create policy "profiles_select_scoped"
  on public.profiles for select
  to authenticated
  using (
    public.is_staff()
    or id = auth.uid()
    or (customer_id is not null and customer_id = public.current_customer_id())
  );

-- ============================================================
-- Replace project policies: staff manage all; customer users read their own;
-- existing project-member access preserved.
-- ============================================================
drop policy if exists "projects_select_member" on public.projects;
drop policy if exists "projects_insert_self_owner" on public.projects;
drop policy if exists "projects_update_owner" on public.projects;
drop policy if exists "projects_delete_owner" on public.projects;

create policy "projects_select"
  on public.projects for select
  to authenticated
  using (
    public.is_staff()
    or customer_id = public.current_customer_id()
    or public.is_project_member(id)
  );

create policy "projects_insert_staff"
  on public.projects for insert
  to authenticated
  with check (public.is_staff() and owner_id = auth.uid());

create policy "projects_update_staff"
  on public.projects for update
  to authenticated
  using (public.is_staff() or owner_id = auth.uid());

create policy "projects_delete_staff"
  on public.projects for delete
  to authenticated
  using (public.is_staff() or owner_id = auth.uid());
