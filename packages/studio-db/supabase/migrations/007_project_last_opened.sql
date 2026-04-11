-- BEO-260: project persistence improvements
-- 1. Add last_opened_at so the dashboard can sort by "recently viewed"
-- 2. Add auto-update trigger for projects.updated_at (was previously stuck
--    at row-creation time because Supabase doesn't auto-update it by default)

alter table public.projects
  add column if not exists last_opened_at timestamptz;

-- updated_at trigger ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;

create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();
