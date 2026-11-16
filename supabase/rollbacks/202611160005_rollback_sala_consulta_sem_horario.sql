-- Reverte 202611160005: restaura as quatro funcoes exatamente como estavam em Production em 16/11 e remove o auxiliar.
-- Nenhum dado e alterado. Nao mexe no historico de migrations.
begin;
CREATE OR REPLACE FUNCTION public.appointment_room_context(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  left join public.appointment_slots sl on sl.id = r.appointment_slot_id
  where s.provider = 'livekit' and s.revoked_at is null
    and (s.closed_at is not null
      or r.status = 'cancelada'
      or sl.id is null
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
        left join public.appointment_slots sl on sl.id = r.appointment_slot_id
        where r.id = request_id and (r.status = 'cancelada' or sl.id is null
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
    join public.appointment_slots sl on sl.id = r.appointment_slot_id
    where m.session_id = s.id and sl.ends_at + interval '30 minutes' < clock_timestamp()
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

drop function if exists public.appointment_request_booked_window(uuid);
commit;
