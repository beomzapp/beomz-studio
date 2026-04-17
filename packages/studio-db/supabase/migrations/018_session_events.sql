-- BEO-370: persist chat messages (pre_build_ack, conversational_response,
-- clarifying_question, build_summary, user prompt) so they survive hard refresh.
alter table public.generations
  add column if not exists session_events jsonb not null default '[]'::jsonb;
