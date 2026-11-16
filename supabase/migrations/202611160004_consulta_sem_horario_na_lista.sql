-- Consulta confirmada de pedido SEM horario aparece com data e hora para o cliente.
--
-- Defeito de 16/11: list_my_appointment_requests buscava inicio/fim so em appointment_slots. Pedido sem horario
-- (202611160003) e confirmado pelo Owner nao tem slot; a consulta chegava sem inicio, a tela a tratava como passada
-- e mostrava "Encerrada" em "Horarios confirmados anteriores".
--
-- Correcao minima: quando nao ha slot, inicio e fim vem da consulta da agenda ligada ao proprio pedido
-- (appointment_requests.reservation_schedule_id -> op_records schedule_items, e o item precisa apontar de volta para
-- o pedido em appointment_request_id). Mesma identidade (auth.uid()), mesmas colunas devolvidas, nenhum dado novo
-- exposto (so as datas da consulta do proprio pedido). Sem tabela, politica ou dado alterado.
-- Reversao: supabase/rollbacks/202611160004_rollback_consulta_sem_horario_na_lista.sql (texto copiado de Production).

begin;

create or replace function public.list_my_appointment_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'service', r.service, 'modality', r.modality,
    'preferred_date', r.preferred_date, 'preferred_period', r.preferred_period,
    'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'slot_id', s.id,
    'starts_at', coalesce(s.starts_at, (agenda.document ->> 'starts_at')::timestamptz),
    'ends_at', coalesce(s.ends_at, (agenda.document ->> 'ends_at')::timestamptz),
    'reservation_schedule_id', r.reservation_schedule_id
  ) order by r.created_at desc), '[]'::jsonb)
  from public.appointment_requests r
  left join public.appointment_slots s on s.id = r.appointment_slot_id
  left join public.op_records agenda
    on agenda.collection = 'schedule_items'
   and agenda.id = r.reservation_schedule_id::text
   and agenda.document ->> 'appointment_request_id' = r.id::text
  where r.requester_user_id = (select auth.uid());
$$;

revoke all on function public.list_my_appointment_requests() from public, anon;
grant execute on function public.list_my_appointment_requests() to authenticated;

commit;
