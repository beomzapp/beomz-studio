create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  template_id text not null,
  operation_id text not null,
  status text not null,
  prompt text not null,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  output_paths text[] not null default '{}',
  summary text,
  error text,
  preview_entry_path text,
  warnings jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists generations_project_id_idx
  on public.generations(project_id);
