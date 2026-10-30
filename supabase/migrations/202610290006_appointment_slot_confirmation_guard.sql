-- Impede que a reserva operacional de uma solicitação autenticada use um
-- horário diferente do slot que o cliente escolheu. Registros legados sem slot
-- continuam seguindo a validação existente da confirmação administrativa.

begin;

create or replace function public.validate_appointment_schedule_slot_match()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request public.appointment_requests%rowtype;
  slot public.appointment_slots%rowtype;
  document_start timestamptz;
  document_end timestamptz;
begin
  if new.collection <> 'schedule_items'
    or new.document ->> 'origin' <> 'appointment_request'
    or nullif(new.document ->> 'appointment_request_id', '') is null then
    return new;
  end if;

  select * into request
    from public.appointment_requests
    where id = (new.document ->> 'appointment_request_id')::uuid;
  if not found or request.appointment_slot_id is null then
    return new;
  end if;

  select * into slot
    from public.appointment_slots
    where id = request.appointment_slot_id;
  if not found
    or slot.held_by_request_id is distinct from request.id
    or slot.status not in ('held', 'booked') then
    raise exception 'O slot vinculado à solicitação não está disponível para confirmação.' using errcode = 'PT409';
  end if;

  begin
    document_start := (new.document ->> 'starts_at')::timestamptz;
    document_end := (new.document ->> 'ends_at')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'Horário da reserva inválido.' using errcode = '22023';
  end;
  if document_start is distinct from slot.starts_at or document_end is distinct from slot.ends_at then
    raise exception 'O horário da reserva diverge do slot solicitado.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_appointment_schedule_slot_match() from public, anon, authenticated;

drop trigger if exists op_records_validate_appointment_slot_match on public.op_records;
create trigger op_records_validate_appointment_slot_match
  before insert or update of document on public.op_records
  for each row execute function public.validate_appointment_schedule_slot_match();

commit;
