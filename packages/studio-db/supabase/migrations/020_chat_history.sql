alter table public.projects
add column if not exists chat_history jsonb default '[]'::jsonb;
