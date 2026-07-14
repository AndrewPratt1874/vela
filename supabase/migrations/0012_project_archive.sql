-- Archive/restore for projects. Archived projects are hidden from default
-- lists (sidebar, dashboard, portal, active tasks) but remain accessible via
-- the Archived filter on the projects page so they can be restored.
-- "Completed" is NOT stored — it's derived in the app from issue statuses
-- (all issues done/cancelled).

alter table public.projects
  add column archived_at timestamptz;

create index projects_archived_idx on public.projects (archived_at) where archived_at is not null;

notify pgrst, 'reload schema';
