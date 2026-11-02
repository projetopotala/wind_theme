-- D4: salas privadas de atendimento online (vídeo + chat).
-- Rascunho LOCAL. Não aplicar no remoto sem autorização expressa.
-- Depende de: appointment_requests, appointment_slots, appointment_profile_accounts,
-- is_appointment_professional(text), op_records (migrations 202610160001..20261030082641).
-- Sala virtual é distinta de op_records/rooms (sala física).
-- Sem gravação e sem armazenamento de áudio/vídeo. O chat é apagado no encerramento.
begin;

do $preflight$
begin
  if to_regclass('public.appointment_requests') is null
    or to_regclass('public.appointment_slots') is null
    or to_regclass('public.appointment_profile_accounts') is null
    or to_regprocedure('public.is_appointment_professional(text)') is null
    or to_regprocedure('public.is_portal_admin()') is null then
    raise exception 'Dependências das salas de atendimento ausentes.';
  end if;
end;
$preflight$;

create table public.appointment_room_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.appointment_requests(id) on delete cascade,
  provider text not null default 'daily' check (provider in ('daily')),
  provider_room_name text not null unique
    check (provider_room_name ~ '^potala-[0-9a-f]{32}$'),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.appointment_room_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.appointment_room_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('client', 'professional')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index appointment_room_messages_session_idx
  on public.appointment_room_messages(session_id, id);

create table public.appointment_room_access_log (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.appointment_room_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('token', 'message')),
  created_at timestamptz not null default now()
);
create index appointment_room_access_log_rate_idx
  on public.appointment_room_access_log(user_id, kind, created_at desc);

-- RLS ligada e nenhuma policy: o acesso é somente pelas RPCs abaixo.
alter table public.appointment_room_sessions enable row level security;
alter table public.appointment_room_messages enable row level security;
alter table public.appointment_room_access_log enable row level security;
revoke all on table public.appointment_room_sessions from public, anon, authenticated;
revoke all on table public.appointment_room_messages from public, anon, authenticated;
revoke all on table public.appointment_room_access_log from public, anon, authenticated;

-- Estado e papel de quem chama, derivados do banco. Nunca confia no navegador.
create function public.appointment_room_context(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  r public.appointment_requests%rowtype;
  s public.appointment_slots%rowtype;
  who text;
  state text;
  opens timestamptz;
  closes timestamptz;
  closed timestamptz;
begin
  if actor is null or p_request_id is null then
    return jsonb_build_object('state', 'denied');
  end if;
  select * into r from public.appointment_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('state', 'denied');
  end if;
  if r.requester_user_id is not distinct from actor then
    who := 'client';
  elsif r.professional_profile_id is not null
    and (select public.is_appointment_professional(r.professional_profile_id)) then
    who := 'professional';
  else
    return jsonb_build_object('state', 'denied');
  end if;
  if r.status = 'cancelada' then
    return jsonb_build_object('state', 'cancelled', 'role', who);
  end if;
  if r.status <> 'encerrada' or r.reservation_schedule_id is null
    or r.modality <> 'online' or r.appointment_slot_id is null then
    return jsonb_build_object('state', 'not_confirmed', 'role', who);
  end if;
  select * into s from public.appointment_slots where id = r.appointment_slot_id;
  if not found or s.status <> 'booked' then
    return jsonb_build_object('state', 'not_confirmed', 'role', who);
  end if;
  opens := s.starts_at - interval '15 minutes';
  closes := s.ends_at + interval '30 minutes';
  select closed_at into closed from public.appointment_room_sessions where request_id = r.id;
  state := case
    when closed is not null then 'closed'
    when clock_timestamp() < opens then 'too_early'
    when clock_timestamp() > closes then 'expired'
    else 'open'
  end;
  return jsonb_build_object('state', state, 'role', who,
    'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'opens_at', opens, 'closes_at', closes,
    'service', r.service, 'requester_name', r.requester_name);
end;
$$;
revoke all on function public.appointment_room_context(uuid) from public, anon;
grant execute on function public.appointment_room_context(uuid) to authenticated;

-- Emite (ou recusa) o acesso. A Edge Function chama com o JWT do usuário e só
-- depois pede o meeting token ao provedor, com validade <= expires_at.
create function public.issue_appointment_room_access(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  ctx jsonb := public.appointment_room_context(p_request_id);
  sess public.appointment_room_sessions%rowtype;
  recent integer;
  expires timestamptz;
begin
  if ctx ->> 'state' = 'denied' then
    raise exception 'Sala inexistente ou inacessível.' using errcode = '42501';
  end if;
  if ctx ->> 'state' <> 'open' then
    raise exception 'Sala indisponível: %.', ctx ->> 'state' using errcode = 'P0001';
  end if;
  insert into public.appointment_room_sessions(request_id, provider_room_name)
  values (p_request_id, 'potala-' || replace(gen_random_uuid()::text, '-', ''))
  on conflict (request_id) do nothing;
  select * into sess from public.appointment_room_sessions where request_id = p_request_id;
  select count(*) into recent from public.appointment_room_access_log
  where user_id = actor and kind = 'token' and created_at > clock_timestamp() - interval '1 minute';
  if recent >= 6 then
    raise exception 'Muitas tentativas. Aguarde um instante.' using errcode = '54000';
  end if;
  insert into public.appointment_room_access_log(session_id, user_id, kind)
  values (sess.id, actor, 'token');
  expires := least(clock_timestamp() + interval '15 minutes', (ctx ->> 'closes_at')::timestamptz);
  return jsonb_build_object('session_id', sess.id, 'room_name', sess.provider_room_name,
    'provider', sess.provider, 'role', ctx ->> 'role', 'expires_at', expires,
    'participant_id', actor);
end;
$$;
revoke all on function public.issue_appointment_room_access(uuid) from public, anon;
grant execute on function public.issue_appointment_room_access(uuid) to authenticated;

create function public.list_appointment_room_messages(p_request_id uuid, p_after bigint default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ctx jsonb := public.appointment_room_context(p_request_id);
begin
  if ctx ->> 'state' in ('denied', 'cancelled', 'not_confirmed') then
    raise exception 'Sala inexistente ou inacessível.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.sender_role,
      'mine', m.sender_id = (select auth.uid()), 'body', m.body, 'created_at', m.created_at)
      order by m.id)
    from public.appointment_room_messages m
    join public.appointment_room_sessions s on s.id = m.session_id
    where s.request_id = p_request_id and m.id > coalesce(p_after, 0)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_appointment_room_messages(uuid, bigint) from public, anon;
grant execute on function public.list_appointment_room_messages(uuid, bigint) to authenticated;

create function public.post_appointment_room_message(p_request_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  ctx jsonb := public.appointment_room_context(p_request_id);
  sess public.appointment_room_sessions%rowtype;
  clean text := btrim(coalesce(p_body, ''));
  recent integer;
  new_id bigint;
begin
  if ctx ->> 'state' = 'denied' then
    raise exception 'Sala inexistente ou inacessível.' using errcode = '42501';
  end if;
  if ctx ->> 'state' <> 'open' then
    raise exception 'Sala indisponível: %.', ctx ->> 'state' using errcode = 'P0001';
  end if;
  if char_length(clean) not between 1 and 1000 then
    raise exception 'Mensagem inválida.' using errcode = '22023';
  end if;
  select * into sess from public.appointment_room_sessions where request_id = p_request_id;
  if not found then
    raise exception 'Entre na sala antes de enviar mensagens.' using errcode = 'P0001';
  end if;
  select count(*) into recent from public.appointment_room_access_log
  where user_id = actor and kind = 'message' and created_at > clock_timestamp() - interval '1 minute';
  if recent >= 30 then
    raise exception 'Muitas mensagens. Aguarde um instante.' using errcode = '54000';
  end if;
  insert into public.appointment_room_access_log(session_id, user_id, kind)
  values (sess.id, actor, 'message');
  insert into public.appointment_room_messages(session_id, sender_id, sender_role, body)
  values (sess.id, actor, ctx ->> 'role', clean)
  returning id into new_id;
  return jsonb_build_object('id', new_id);
end;
$$;
revoke all on function public.post_appointment_room_message(uuid, text) from public, anon;
grant execute on function public.post_appointment_room_message(uuid, text) to authenticated;

-- Só o profissional encerra para todos; o chat é apagado (sem retenção por padrão).
create function public.close_appointment_room_session(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  ctx jsonb := public.appointment_room_context(p_request_id);
  sess_id uuid;
begin
  if ctx ->> 'state' = 'denied' or ctx ->> 'role' is distinct from 'professional' then
    raise exception 'Seu acesso não permite encerrar a sala.' using errcode = '42501';
  end if;
  update public.appointment_room_sessions
  set closed_at = coalesce(closed_at, clock_timestamp()), closed_by = coalesce(closed_by, actor)
  where request_id = p_request_id
  returning id into sess_id;
  if sess_id is not null then
    delete from public.appointment_room_messages where session_id = sess_id;
  end if;
  return jsonb_build_object('closed', sess_id is not null);
end;
$$;
revoke all on function public.close_appointment_room_session(uuid) from public, anon;
grant execute on function public.close_appointment_room_session(uuid) to authenticated;

-- Limpeza de sessões vencidas (administradores).
create function public.purge_expired_appointment_room_messages()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare n integer;
begin
  if not (select public.is_portal_admin()) then
    raise exception 'Seu acesso não permite esta limpeza.' using errcode = '42501';
  end if;
  with gone as (
    delete from public.appointment_room_messages m
    using public.appointment_room_sessions s
    join public.appointment_requests r on r.id = s.request_id
    join public.appointment_slots sl on sl.id = r.appointment_slot_id
    where m.session_id = s.id and sl.ends_at + interval '30 minutes' < clock_timestamp()
    returning 1)
  select count(*) into n from gone;
  return n;
end;
$$;
revoke all on function public.purge_expired_appointment_room_messages() from public, anon;
grant execute on function public.purge_expired_appointment_room_messages() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.issue_appointment_room_access(uuid)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.appointment_room_messages', 'SELECT') then
    raise exception 'Privilégios das salas de atendimento incorretos.';
  end if;
end;
$$;

commit;

-- Recuperação (manual, só se necessário):
-- drop function public.purge_expired_appointment_room_messages();
-- drop function public.close_appointment_room_session(uuid);
-- drop function public.post_appointment_room_message(uuid, text);
-- drop function public.list_appointment_room_messages(uuid, bigint);
-- drop function public.issue_appointment_room_access(uuid);
-- drop function public.appointment_room_context(uuid);
-- drop table public.appointment_room_access_log, public.appointment_room_messages, public.appointment_room_sessions;
