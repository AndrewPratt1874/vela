-- Let customers edit their own tickets (status/priority/category/subject/body),
-- but NOT reassign them or move them between customers.
-- Run in Supabase SQL editor (or via `supabase db push`).

-- Allow customer users to update tickets belonging to their customer.
-- (Staff already have tickets_update_staff; UPDATE policies are OR-ed.)
create policy "tickets_update_customer"
  on public.tickets for update
  to authenticated
  using (customer_id = public.current_customer_id())
  with check (customer_id = public.current_customer_id());

-- Guard: non-staff cannot change assignment, ownership, customer or number.
-- RLS can't restrict individual columns, so reset protected fields to their
-- previous values for any non-staff update.
create or replace function public.guard_ticket_customer_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    new.assigned_to := old.assigned_to;
    new.created_by  := old.created_by;
    new.customer_id := old.customer_id;
    new.number      := old.number;
  end if;
  return new;
end;
$$;

create trigger tickets_guard_customer_update
  before update on public.tickets
  for each row execute function public.guard_ticket_customer_update();
