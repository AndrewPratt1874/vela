-- Phase: let customer users triage their own tickets.
-- Customers may now change status / priority / category on tickets belonging
-- to their customer. All other columns remain staff-only, enforced by a
-- BEFORE UPDATE trigger (RLS is row-level only and can't restrict columns).

-- ============================================================
-- Broaden the update policy: staff (all) or a customer user on their own.
-- ============================================================
drop policy if exists "tickets_update_staff" on public.tickets;

create policy "tickets_update"
  on public.tickets for update
  to authenticated
  using (
    public.is_staff()
    or customer_id = public.current_customer_id()
  )
  with check (
    public.is_staff()
    or customer_id = public.current_customer_id()
  );

-- ============================================================
-- Column guard: a non-staff user may only touch status/priority/category.
-- (updated_at / resolved_at are set by other BEFORE triggers, so they're not
-- checked here.)
-- ============================================================
create or replace function public.enforce_customer_ticket_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_staff() then
    return new;
  end if;
  if new.customer_id  is distinct from old.customer_id
     or new.number     is distinct from old.number
     or new.subject    is distinct from old.subject
     or new.body       is distinct from old.body
     or new.created_by is distinct from old.created_by
     or new.assigned_to is distinct from old.assigned_to
     or new.created_at is distinct from old.created_at then
    raise exception 'You can only change status, priority, or category on your tickets';
  end if;
  return new;
end;
$$;

-- Name sorts before the other before-update triggers so it gates first.
create trigger tickets_enforce_customer_update
  before update on public.tickets
  for each row execute function public.enforce_customer_ticket_update();
