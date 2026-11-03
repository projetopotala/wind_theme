-- D4: provedor de video LiveKit (incremental sobre 202611020001_appointment_private_rooms).
-- Rascunho LOCAL. Nao aplicar no remoto sem autorizacao expressa.
-- Preserva o historico: sessoes 'daily' continuam validas e legiveis.
begin;

do $preflight$
begin
  if to_regclass('public.appointment_room_sessions') is null
    or to_regclass('public.appointment_requests') is null
    or to_regclass('public.appointment_slots') is null then
    raise exception 'Tabelas das salas de atendimento ausentes.';
  end if;
end;
$preflight$;

-- 1. Permite 'livekit' (mantem 'daily') e torna LiveKit o provedor das novas sessoes.
do $swap$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.appointment_room_sessions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mprovider\M'
  loop
    execute format('alter table public.appointment_room_sessions drop constraint %I', c);
  end loop;
end;
$swap$;
alter table public.appointment_room_sessions
  add constraint appointment_room_sessions_provider_check check (provider in ('daily', 'livekit'));
alter table public.appointment_room_sessions alter column provider set default 'livekit';

-- 2. Revogacao confirmada no provedor (nulo = ainda nao confirmada).
alter table public.appointment_room_sessions add column revoked_at timestamptz;

-- 3. Fila de revogacao para o varredor (somente service_role): salas LiveKit encerradas
-- ou vencidas cuja desconexao ainda nao foi confirmada. Garante o fim da consulta mesmo que
-- o profissional nao encerre e que a funcao de borda tenha sido interrompida.
create function public.appointment_rooms_pending_revocation(p_limit integer default 50)
returns table(session_id uuid, request_id uuid, room_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.request_id, s.provider_room_name
  from public.appointment_room_sessions s
  join public.appointment_requests r on r.id = s.request_id
  left join public.appointment_slots sl on sl.id = r.appointment_slot_id
  where s.provider = 'livekit' and s.revoked_at is null
    and (s.closed_at is not null
      or r.status = 'cancelada'
      or sl.id is null
      or sl.ends_at + interval '30 minutes' < clock_timestamp())
  order by s.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke all on function public.appointment_rooms_pending_revocation(integer) from public, anon, authenticated;
grant execute on function public.appointment_rooms_pending_revocation(integer) to service_role;

create function public.mark_appointment_room_revoked(p_session_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare n integer;
begin
  update public.appointment_room_sessions
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where id = p_session_id
    and (closed_at is not null
      or exists (select 1 from public.appointment_requests r
        left join public.appointment_slots sl on sl.id = r.appointment_slot_id
        where r.id = request_id and (r.status = 'cancelada' or sl.id is null
          or sl.ends_at + interval '30 minutes' < clock_timestamp())));
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.mark_appointment_room_revoked(uuid) from public, anon, authenticated;
grant execute on function public.mark_appointment_room_revoked(uuid) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.appointment_rooms_pending_revocation(integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.appointment_rooms_pending_revocation(integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.mark_appointment_room_revoked(uuid)', 'EXECUTE') then
    raise exception 'Privilegios da revogacao de salas incorretos.';
  end if;
end;
$$;

commit;

-- Recuperacao (manual, so se necessario; nao ha sessao livekit antes do deploy):
-- drop function public.mark_appointment_room_revoked(uuid);
-- drop function public.appointment_rooms_pending_revocation(integer);
-- alter table public.appointment_room_sessions drop column revoked_at;
-- alter table public.appointment_room_sessions alter column provider set default 'daily';
-- (restaurar a constraint so se nao existir nenhuma linha 'livekit')
