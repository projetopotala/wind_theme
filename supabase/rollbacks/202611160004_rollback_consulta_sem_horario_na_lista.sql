-- Reverte 202611160004: restaura list_my_appointment_requests exatamente como estava em Production em 16/11.
-- Nenhum dado e alterado. Nao mexe no historico de migrations.
begin;
CREATE OR REPLACE FUNCTION public.list_my_appointment_requests()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'service', r.service, 'modality', r.modality,
    'preferred_date', r.preferred_date, 'preferred_period', r.preferred_period,
    'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'slot_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'reservation_schedule_id', r.reservation_schedule_id
  ) order by r.created_at desc), '[]'::jsonb)
  from public.appointment_requests r
  left join public.appointment_slots s on s.id = r.appointment_slot_id
  where r.requester_user_id = (select auth.uid());
$function$;

revoke all on function public.list_my_appointment_requests() from public, anon;
grant execute on function public.list_my_appointment_requests() to authenticated;
commit;
