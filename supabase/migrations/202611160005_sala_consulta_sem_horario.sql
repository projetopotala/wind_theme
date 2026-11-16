-- Sala online de consulta confirmada SEM horario pre-cadastrado.
--
-- Defeito de 16/11: o Owner confirmou o pedido 8085edc1 (sem slot) para 16/11 05:00 online. A sala respondia
-- "Atendimento sem sala" porque appointment_room_context exigia appointment_slot_id; o token LiveKit, as mensagens e o
-- fechamento passam por essa funcao. As rotinas de manutencao (revogar acesso, marcar revogado, limpar mensagens)
-- tambem usavam so o slot e tratariam essas salas como "sem horario".
--
-- Correcao minima: appointment_request_booked_window(pedido) devolve inicio/fim da consulta reservada do pedido:
--   * com slot: o slot com status booked (regra anterior, inalterada);
--   * sem slot: o item da agenda (op_records schedule_items) apontado por reservation_schedule_id, que precisa apontar
--     de volta para o pedido (appointment_request_id), estar reservado (booked) e ser online.
-- As quatro funcoes passam a usar esse auxiliar no lugar do slot; o resto do texto e o de Production.
-- Preservado: so cliente do pedido ou profissional vinculado (is_appointment_professional); pedido precisa estar
-- encerrada (confirmado) com reserva e online; janela -15 min / +30 min; cancelada, fechada e expirada continuam
-- bloqueadas. O auxiliar nao e executavel por anon nem authenticated. Nenhuma tabela, politica ou dado alterado.
-- Reversao: supabase/rollbacks/202611160005_rollback_sala_consulta_sem_horario.sql (texto copiado de Production).

begin;

create or replace function public.appointment_request_booked_window(p_request_id uuid)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- Pedido com horario pre-cadastrado: o slot reservado (mesma regra anterior).
  select s.starts_at, s.ends_at
  from public.appointment_requests r
  join public.appointment_slots s on s.id = r.appointment_slot_id and s.status = 'booked'
  where r.id = p_request_id and r.appointment_slot_id is not null
  union all
  -- Pedido sem horario (confirmado pelo Owner na agenda): a consulta ligada ao proprio pedido, reservada e online.
  select (a.document ->> 'starts_at')::timestamptz, (a.document ->> 'ends_at')::timestamptz
  from public.appointment_requests r
  join public.op_records a
    on a.collection = 'schedule_items'
   and a.id = r.reservation_schedule_id::text
   and a.document ->> 'appointment_request_id' = r.id::text
   and coalesce(a.document ->> 'status', 'booked') = 'booked'
   and a.document ->> 'mode' = 'online'
  where r.id = p_request_id and r.appointment_slot_id is null
  limit 1;
$$;
revoke all on function public.appointment_request_booked_window(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.appointment_room_context(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  r public.appointment_requests%rowtype;
  v_inicio timestamptz;
  v_fim timestamptz;
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
  if r.status <> 'encerrada' or r.reservation_schedule_id is null or r.modality <> 'online' then
    return jsonb_build_object('state', 'not_confirmed', 'role', who);
  end if;
  select t.starts_at, t.ends_at into v_inicio, v_fim from public.appointment_request_booked_window(r.id) t;
  if v_inicio is null or v_fim is null then
    return jsonb_build_object('state', 'not_confirmed', 'role', who);
  end if;
  opens := v_inicio - interval '15 minutes';
  closes := v_fim + interval '30 minutes';
  select closed_at into closed from public.appointment_room_sessions where request_id = r.id;
  state := case
    when closed is not null then 'closed'
    when clock_timestamp() < opens then 'too_early'
    when clock_timestamp() > closes then 'expired'
    else 'open'
  end;
  return jsonb_build_object('state', state, 'role', who,
    'starts_at', v_inicio, 'ends_at', v_fim,
    'opens_at', opens, 'closes_at', closes,
    'service', r.service, 'requester_name', r.requester_name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.appointment_rooms_pending_revocation(p_limit integer DEFAULT 50)
 RETURNS TABLE(session_id uuid, request_id uuid, room_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id, s.request_id, s.provider_room_name
  from public.appointment_room_sessions s
  join public.appointment_requests r on r.id = s.request_id
  left join lateral public.appointment_request_booked_window(r.id) sl on true
  where s.provider = 'livekit' and s.revoked_at is null
    and (s.closed_at is not null
      or r.status = 'cancelada'
      or sl.ends_at is null
      or sl.ends_at + interval '30 minutes' < clock_timestamp())
  order by s.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

CREATE OR REPLACE FUNCTION public.mark_appointment_room_revoked(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  update public.appointment_room_sessions
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where id = p_session_id
    and (closed_at is not null
      or exists (select 1 from public.appointment_requests r
        left join lateral public.appointment_request_booked_window(r.id) sl on true
        where r.id = request_id and (r.status = 'cancelada' or sl.ends_at is null
          or sl.ends_at + interval '30 minutes' < clock_timestamp())));
  get diagnostics n = row_count;
  return n > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.purge_expired_appointment_room_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  if not (select public.is_portal_admin()) then
    raise exception 'Seu acesso não permite esta limpeza.' using errcode = '42501';
  end if;
  with gone as (
    delete from public.appointment_room_messages m
    using public.appointment_room_sessions s
    join public.appointment_requests r on r.id = s.request_id
    cross join lateral public.appointment_request_booked_window(r.id) sl
    where m.session_id = s.id and sl.ends_at is not null and sl.ends_at + interval '30 minutes' < clock_timestamp()
    returning 1)
  select count(*) into n from gone;
  -- Log de limite de taxa não precisa de mais de um dia.
  delete from public.appointment_room_access_log where created_at < clock_timestamp() - interval '1 day';
  return n;
end;
$function$;

revoke all on function public.appointment_room_context(uuid) from public, anon;
grant execute on function public.appointment_room_context(uuid) to authenticated;
revoke all on function public.appointment_rooms_pending_revocation(integer) from public, anon, authenticated;
revoke all on function public.mark_appointment_room_revoked(uuid) from public, anon, authenticated;
revoke all on function public.purge_expired_appointment_room_messages() from public, anon;
grant execute on function public.purge_expired_appointment_room_messages() to authenticated;

commit;
