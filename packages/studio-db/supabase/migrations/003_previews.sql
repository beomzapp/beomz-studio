create table if not exists public.previews (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null unique references public.generations(id) on delete cascade,
  sandbox_id text,
  status text not null,
  preview_url text,
  started_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  error text
);

create index if not exists previews_generation_id_idx
  on public.previews(generation_id);

create index if not exists previews_sandbox_id_idx
  on public.previews(sandbox_id)
  where sandbox_id is not null;

do $$
begin
  alter publication supabase_realtime add table public.generations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.previews;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
