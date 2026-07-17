-- ============================================================
-- Notification bodies for ticket comments were storing raw HTML
-- (reply bodies are rich text), so previews showed literal <p>…</p>
-- tags. Strip tags before truncating so stored bodies are plain text.
-- ============================================================

create or replace function public.strip_html(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        -- decode a few common entities, drop tags, collapse whitespace
        regexp_replace(
          replace(replace(replace(replace(replace(
            coalesce(p, ''),
            '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&#39;', ''''),
          '<[^>]*>', ' ', 'g'),
        '\s+', ' ', 'g')
    ),
    ''
  );
$$;

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
  v_body text;
begin
  select * into v_ticket from public.tickets where id = new.ticket_id;
  select is_staff into v_author_staff from public.profiles where id = new.author_id;

  v_body := left(public.strip_html(new.body), 140);

  -- Always notify the reporter and the assignee (notify_user skips the author)
  perform public.notify_user(
    v_ticket.created_by, new.author_id, 'ticket_comment',
    'New reply on #' || v_ticket.number, v_body, v_ticket.id
  );
  perform public.notify_user(
    v_ticket.assigned_to, new.author_id, 'ticket_comment',
    'New reply on #' || v_ticket.number, v_body, v_ticket.id
  );

  -- If a customer replied, make sure all staff hear about it.
  if coalesce(v_author_staff, false) = false then
    for v_staff in select id from public.profiles where is_staff = true loop
      perform public.notify_user(
        v_staff.id, new.author_id, 'ticket_comment',
        'New reply on #' || v_ticket.number, v_body, v_ticket.id
      );
    end loop;
  end if;
  return new;
end;
$$;

-- Backfill existing notification bodies that still contain HTML tags.
update public.notifications
set body = public.strip_html(body)
where body like '%<%>%';
