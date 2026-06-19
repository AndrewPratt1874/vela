-- Give customers full access to the issue tracker for their own projects.
-- can_access_project() gates issue/label/issue_label read AND write policies,
-- so adding a customer-ownership branch lets customers view and manage issues
-- on projects belonging to their customer_id (staff and project members keep
-- their existing access).

create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    public.is_staff()
    or public.is_project_member(p_project_id)
    or exists (
      select 1 from public.projects p
      where p.id = p_project_id
        and p.customer_id is not null
        and p.customer_id = public.current_customer_id()
    );
$$;
