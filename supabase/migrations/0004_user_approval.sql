-- Phase 3: Admin approval for new users
-- New signups land in a 'pending' state and cannot access any data until a
-- staff member approves them. Staff-domain signups are auto-approved.

-- ============================================================
-- Approval columns on profiles
-- ============================================================
alter table public.profiles
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- Grandfather every existing user in (they were created before approval existed).
update public.profiles set status = 'approved', approved_at = now() where status <> 'approved';

-- ============================================================
-- Signup trigger: pending by default, auto-approve staff
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

  insert into public.profiles (id, email, full_name, customer_id, is_staff, status, approved_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_customer_id,
    v_is_staff,
    case when v_is_staff then 'approved' else 'pending' end,
    case when v_is_staff then now() else null end
  );
  return new;
end;
$$;

-- ============================================================
-- Enforce approval at the RLS layer: an unapproved user is treated as
-- having no staff role and no customer, so existing policies return nothing.
-- ============================================================
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select is_staff and status = 'approved' from public.profiles where id = auth.uid()),
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
  select customer_id from public.profiles
  where id = auth.uid() and status = 'approved';
$$;

-- ============================================================
-- Approval actions (staff only). SECURITY DEFINER so they can update other
-- users' profiles, which RLS otherwise forbids.
-- ============================================================
create or replace function public.approve_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can approve users';
  end if;
  update public.profiles
    set status = 'approved', approved_at = now(), approved_by = auth.uid()
    where id = target;
end;
$$;

create or replace function public.reject_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can reject users';
  end if;
  update public.profiles
    set status = 'rejected', approved_at = now(), approved_by = auth.uid()
    where id = target;
end;
$$;

grant execute on function public.approve_user(uuid) to authenticated;
grant execute on function public.reject_user(uuid) to authenticated;
