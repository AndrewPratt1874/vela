-- Phase 4: Customer logos
-- Adds a logo to customers, stored in a public storage bucket and shown on
-- project cards, customer lists, etc.

alter table public.customers
  add column if not exists logo_url text;

-- ============================================================
-- Public storage bucket for logos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('customer-logos', 'customer-logos', true)
on conflict (id) do update set public = true;

-- ============================================================
-- Storage RLS: anyone may read (public bucket); only staff may write.
-- ============================================================
drop policy if exists "customer_logos_read" on storage.objects;
create policy "customer_logos_read"
  on storage.objects for select
  using (bucket_id = 'customer-logos');

drop policy if exists "customer_logos_insert" on storage.objects;
create policy "customer_logos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'customer-logos' and public.is_staff());

drop policy if exists "customer_logos_update" on storage.objects;
create policy "customer_logos_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'customer-logos' and public.is_staff())
  with check (bucket_id = 'customer-logos' and public.is_staff());

drop policy if exists "customer_logos_delete" on storage.objects;
create policy "customer_logos_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'customer-logos' and public.is_staff());
