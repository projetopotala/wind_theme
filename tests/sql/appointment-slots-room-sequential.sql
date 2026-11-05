\set ON_ERROR_STOP on

set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $test$
declare
  base timestamptz := date_trunc('day', now()) + interval '400 days 10 hours';
  first_slot uuid;
  failed boolean;
begin
  first_slot := (public.create_appointment_slot(jsonb_build_object(
    'offering_id','test-offer-a','professional_profile_id','test-prof-a','room_id','test-room-a',
    'starts_at',base,'ends_at',base + interval '1 hour'
  )) ->> 'id')::uuid;

  failed := false;
  begin
    perform public.create_appointment_slot(jsonb_build_object(
      'offering_id','test-offer-a','professional_profile_id','test-prof-a','room_id','test-room-b',
      'starts_at',base + interval '30 minutes','ends_at',base + interval '90 minutes'));
  exception when sqlstate 'PT409' then failed := true;
  end;
  if not failed then raise exception 'Sobreposicao do mesmo profissional foi aceita.'; end if;

  failed := false;
  begin
    perform public.create_appointment_slot(jsonb_build_object(
      'offering_id','test-offer-b','professional_profile_id','test-prof-b','room_id','test-room-a',
      'starts_at',base + interval '30 minutes','ends_at',base + interval '90 minutes'));
  exception when sqlstate 'PT409' then failed := true;
  end;
  if not failed then raise exception 'Sobreposicao da mesma sala foi aceita.'; end if;

  perform public.create_appointment_slot(jsonb_build_object(
    'offering_id','test-offer-b','professional_profile_id','test-prof-b','room_id','test-room-b',
    'starts_at',base + interval '30 minutes','ends_at',base + interval '90 minutes'));

  perform public.create_appointment_slot(jsonb_build_object(
    'offering_id','test-offer-a','professional_profile_id','test-prof-a','room_id','test-room-a',
    'starts_at',base + interval '1 hour','ends_at',base + interval '2 hours'));

  perform public.create_appointment_slot(jsonb_build_object(
    'offering_id','test-offer-online','professional_profile_id','test-prof-c',
    'starts_at',base,'ends_at',base + interval '1 hour'));

  update public.appointment_slots set status='cancelled' where id=first_slot;
  perform public.create_appointment_slot(jsonb_build_object(
    'offering_id','test-offer-d','professional_profile_id','test-prof-d','room_id','test-room-a',
    'starts_at',base + interval '15 minutes','ends_at',base + interval '45 minutes'));

  if (select count(*) from public.appointment_slots) <> 5 then
    raise exception 'Quantidade inesperada de slots no teste sequencial.';
  end if;
end;
$test$;
