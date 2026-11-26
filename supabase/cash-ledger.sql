-- Apply only after database is ACTIVE_HEALTHY; non-destructive, independent of existing transaction tables.
begin;
create table if not exists public.bakul_cash_days (
 day date primary key,
 opening bigint check (opening between 0 and 999999999999),
 opening_note text not null default '' check (length(opening_note)<=200),
 actual bigint check (actual between 0 and 999999999999),
 actual_note text not null default '' check (length(actual_note)<=200),
 counted_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.bakul_cash_movements (
 id uuid primary key,
 day date not null,
 kind text not null check (kind in ('addition','transfer_in','transfer_out')),
 amount bigint not null check (amount between 1 and 999999999999),
 note text not null check (length(btrim(note)) between 1 and 200),
 created_at timestamptz not null default now()
);
create index if not exists bakul_cash_movements_day_idx on public.bakul_cash_movements(day);
alter table public.bakul_cash_days enable row level security;
alter table public.bakul_cash_movements enable row level security;
revoke all on public.bakul_cash_days,public.bakul_cash_movements from public,anon,authenticated;
grant select,insert,update on public.bakul_cash_days,public.bakul_cash_movements to service_role;
commit;
