-- Notify staff (in-app) when a new user registers and is awaiting approval.
-- Fires on profile insert; the email channel is handled by /api/notify-registration.
create or replace function public.on_profile_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff record;
begin
  -- Only for new pending customer signups; staff self-signups are auto-approved.
  if new.status = 'approved' or new.is_staff then
    return new;
  end if;

  for v_staff in
    select id from public.profiles where is_staff = true and status = 'approved'
  loop
    insert into public.notifications (user_id, type, title, body)
    values (
      v_staff.id,
      'user_registered',
      'New registration: ' || coalesce(new.email, 'someone'),
      coalesce(new.full_name, new.email, 'A new user') || ' signed up and is awaiting approval.'
    );
  end loop;
  return new;
end;
$$;

create trigger profiles_notify_created
  after insert on public.profiles
  for each row execute function public.on_profile_created();
