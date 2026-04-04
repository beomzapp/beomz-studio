create table if not exists public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  prompt text not null,
  phase text not null default 'idle',
  questions jsonb,
  answers jsonb not null default '{}'::jsonb,
  summary text,
  steps jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists plan_sessions_user_id_idx
  on public.plan_sessions(user_id);

create index if not exists plan_sessions_updated_at_idx
  on public.plan_sessions(updated_at desc);

do $$
begin
  alter publication supabase_realtime add table public.plan_sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
