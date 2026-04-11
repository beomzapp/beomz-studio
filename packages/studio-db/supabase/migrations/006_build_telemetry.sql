create table if not exists public.build_telemetry (
  id uuid primary key references public.generations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  prompt text not null,
  template_used text not null,
  palette_used text,
  files_generated integer not null default 0,
  succeeded boolean not null default false,
  fallback_reason text,
  error_log jsonb,
  generation_time_ms integer,
  credits_used integer not null default 0,
  user_iterated boolean not null default false,
  iteration_count integer not null default 0,
  model_used text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists build_telemetry_project_id_idx
  on public.build_telemetry(project_id);

create index if not exists build_telemetry_user_id_idx
  on public.build_telemetry(user_id);

create index if not exists build_telemetry_created_at_idx
  on public.build_telemetry(created_at desc);
