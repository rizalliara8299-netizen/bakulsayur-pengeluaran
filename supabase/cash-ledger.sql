-- Apply only after database is ACTIVE_HEALTHY; non-destructive, independent of existing transaction tables.
begin;
create table if not exists public.bakul_cash_days (
 day date primary key,
 opening bigint check (opening between 0 and 999999999999),
 opening_note text not null default '' check (length(opening_note)<=200),
 actual bigint check (actual between 0 and 999999999999),
 actual_note text not null default '' check (length(actual_note)<=200),
 counted_at timestamptz,
 counted_expected bigint,
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
create or replace function public.bakul_cash_write(p_day date,p_kind text,p_amount bigint,p_note text,p_id uuid,p_expected bigint default null)
returns jsonb language plpgsql security invoker set search_path = '' as $bakul_cash$
declare v_expected bigint; v_opening bigint;
begin
 if p_day is null or p_kind is null or p_kind not in ('opening','actual','addition','transfer_in','transfer_out')
 or p_amount is null or p_amount not between 0 and 999999999999 or length(coalesce(p_note,''))>200 then raise exception 'Data kas tidak valid.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('bakul_cash:'||p_day::text));
 if p_kind='opening' then
 insert into public.bakul_cash_days(day,opening,opening_note) values(p_day,p_amount,coalesce(p_note,''))
 on conflict(day) do update set opening=excluded.opening,opening_note=excluded.opening_note,updated_at=now();
 elsif p_kind='actual' then
 select opening into v_opening from public.bakul_cash_days where day=p_day;
 if v_opening is null then raise exception 'Isi saldo awal terlebih dahulu.'; end if;
 select v_opening+coalesce(sum(case when kind='transfer_out' then -amount else amount end),0) into v_expected from public.bakul_cash_movements where day=p_day;
 select v_expected-coalesce(sum(total_price),0) into v_expected from public.bakul_transactions where transaction_date=p_day and payment_code='tunai';
 if p_expected is distinct from v_expected then raise exception 'Saldo berubah. Muat ulang laporan sebelum mencocokkan.'; end if;
 update public.bakul_cash_days set actual=p_amount,actual_note=coalesce(p_note,''),counted_at=now(),counted_expected=v_expected,updated_at=now() where day=p_day;
 else
 if p_id is null or p_amount=0 or length(btrim(coalesce(p_note,'')))=0 then raise exception 'Nominal dan keterangan wajib diisi.'; end if;
 insert into public.bakul_cash_movements(id,day,kind,amount,note) values(p_id,p_day,p_kind,p_amount,btrim(p_note)) on conflict(id) do nothing;
 end if;
 return jsonb_build_object('ok',true,'expected',v_expected);
end;
$bakul_cash$;
revoke all on function public.bakul_cash_write(date,text,bigint,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.bakul_cash_write(date,text,bigint,text,uuid,bigint) to service_role;
commit;
