alter table public.orgs
  add column if not exists credits_balance numeric;

update public.orgs
set credits_balance = coalesce(credits_balance, credits::numeric);

alter table public.orgs
  alter column credits_balance set default 50;

update public.orgs
set credits_balance = 50
where credits_balance is null;

alter table public.orgs
  alter column credits_balance set not null;

alter table public.generations
  add column if not exists session_events jsonb not null default '[]'::jsonb;

alter table public.generations
  add column if not exists credits_used numeric not null default 0;

alter table public.generations
  add column if not exists total_cost_usd numeric not null default 0;

create or replace function public.append_generation_session_event(
  target_generation_id uuid,
  next_event jsonb
)
returns void
language plpgsql
as $$
begin
  if next_event is null then
    raise exception 'Session event payload is required.';
  end if;

  update public.generations
  set session_events = coalesce(session_events, '[]'::jsonb) || jsonb_build_array(next_event)
  where id = target_generation_id;

  if not found then
    raise exception 'Generation % does not exist.', target_generation_id;
  end if;
end;
$$;

create or replace function public.deduct_org_credits_balance(
  target_org_id uuid,
  requested_cost numeric
)
returns numeric
language plpgsql
as $$
declare
  updated_balance numeric;
begin
  if requested_cost is null or requested_cost < 0 then
    raise exception 'Credit deduction must be a non-negative numeric value.';
  end if;

  if requested_cost = 0 then
    select credits_balance
    into updated_balance
    from public.orgs
    where id = target_org_id;

    if updated_balance is null then
      raise exception 'Org % does not exist.', target_org_id;
    end if;

    return updated_balance;
  end if;

  update public.orgs
  set credits_balance = credits_balance - requested_cost
  where id = target_org_id
    and credits_balance >= requested_cost
  returning credits_balance into updated_balance;

  if updated_balance is not null then
    return updated_balance;
  end if;

  select credits_balance
  into updated_balance
  from public.orgs
  where id = target_org_id;

  if updated_balance is null then
    raise exception 'Org % does not exist.', target_org_id;
  end if;

  raise exception 'INSUFFICIENT_CREDITS';
end;
$$;
