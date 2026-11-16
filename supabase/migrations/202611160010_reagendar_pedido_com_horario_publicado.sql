-- Reagendamento pelo Owner de um pedido que escolheu um horario publicado (slot).
--
-- Defeito de 16/11 (homologacao): o pedido "Flamengo" de 16/11 11h-12h escolheu um slot que ja passou. O banco exigia que a
-- reserva tivesse EXATAMENTE o horario do slot (validate_appointment_schedule_slot_match) e a confirmacao exige inicio
-- futuro; logo o Owner nao tinha como confirmar o pedido em outro horario.
--
-- Correcao minima: so a funcao validate_appointment_schedule_slot_match (gatilho que roda ao criar o item da agenda da
-- confirmacao). Sem tabela, politica RLS ou funcao de sala/LiveKit.
--   * Horario IGUAL ao do slot: nada muda (o slot ja foi marcado booked pelo gatilho existente).
--   * Horario DIFERENTE: o slot e liberado (available se ainda futuro; cancelled se ja passou) e o pedido deixa de apontar
--     para ele (appointment_slot_id = null). A sala passa a usar a janela da consulta da agenda, como nos pedidos sem horario.
--   * Continua recusando slot que nao pertence mais ao pedido (PT409) e horario invalido (22023).
-- O pedido original continua o mesmo registro (encerrada, com reservation_schedule_id); nada e apagado.
-- Reversao: supabase/rollbacks/202611160010_rollback_reagendar_pedido_com_horario_publicado.sql

begin;

create or replace function public.validate_appointment_schedule_slot_match()
returns trigger
language plpgsql
security definer
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
    /* Reagendamento do Owner: libera o horario publicado e desliga o pedido dele. */
    update public.appointment_slots
      set status = case when starts_at > now() then 'available' else 'cancelled' end,
          held_by_request_id = null, updated_at = now()
      where id = slot.id and held_by_request_id = request.id;
    update public.appointment_requests set appointment_slot_id = null where id = request.id;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_appointment_schedule_slot_match() from public, anon, authenticated;

commit;
