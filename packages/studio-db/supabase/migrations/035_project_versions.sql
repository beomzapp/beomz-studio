create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null,
  label text not null,
  files jsonb not null default '{}'::jsonb,
  file_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists project_versions_project_id_version_number_key
  on public.project_versions(project_id, version_number);

create index if not exists project_versions_project_id_created_at_idx
  on public.project_versions(project_id, created_at desc);

notify pgrst, 'reload schema';
