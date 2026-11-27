begin;

-- Restaura a trava global PAY-02 antes de remover a excecao restrita do piloto.
create or replace function public.pay_insert_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pay_charges_enabled() then
    raise exception 'Cobrancas ainda nao autorizadas.' using errcode = 'PT503';
  end if;
  return new;
end;
$$;

-- Restaura a preparacao PAY-01 sem a autorizacao piloto.
create or replace function public.pay_prepare_appointment_payment(p_user_id uuid, p_request_id uuid, p_idempotency_key uuid, p_hold_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.appointment_requests; slot public.appointment_slots; preco public.appointment_service_prices;
  pay public.appointment_payments; hold timestamptz; novo uuid := gen_random_uuid();
begin
  if p_user_id is null or p_request_id is null or p_idempotency_key is null
     or p_hold_minutes is null or p_hold_minutes not between 5 and 1440 then
    raise exception 'Pedido de pagamento invalido.' using errcode = '22023';
  end if;
  select * into pay from public.appointment_payments where idempotency_key = p_idempotency_key;
  if found then
    if pay.client_id <> p_user_id or pay.request_id <> p_request_id then
      raise exception 'Acesso negado.' using errcode = '42501';
    end if;
    return public.pay_payment_json(pay, true);
  end if;
  select * into r from public.appointment_requests where id = p_request_id for update;
  if not found or r.requester_user_id is distinct from p_user_id then
    raise exception 'Solicitacao nao encontrada.' using errcode = 'P0002';
  end if;
  if r.status not in ('recebida', 'em_contato') or r.reservation_schedule_id is not null or r.appointment_slot_id is null then
    raise exception 'A solicitacao nao esta em um estado que permita pagamento.' using errcode = '22023';
  end if;
  select * into slot from public.appointment_slots where id = r.appointment_slot_id for update;
  if not found or slot.status <> 'held' or slot.held_by_request_id is distinct from r.id or slot.starts_at <= now() then
    raise exception 'O horario nao esta mais reservado para esta solicitacao.' using errcode = '22023';
  end if;
  select * into pay from public.appointment_payments
   where request_id = r.id and status in ('criando', 'aguardando_pagamento', 'em_processamento', 'confirmado', 'recebido', 'vencido', 'em_contestacao', 'divergente');
  if found then return public.pay_payment_json(pay, true); end if;
  select * into preco from public.appointment_service_prices where offering_id = r.offering_id and active;
  if not found then
    raise exception 'Este atendimento ainda nao tem valor definido para pagamento online.' using errcode = 'PT422';
  end if;
  hold := least(now() + make_interval(mins => p_hold_minutes), slot.starts_at);
  insert into public.appointment_payments (id, request_id, client_id, offering_id, idempotency_key, external_reference,
    amount_cents, currency, due_date, hold_expires_at)
  values (novo, r.id, p_user_id, r.offering_id, p_idempotency_key, 'appointment:' || novo::text,
    preco.amount_cents, preco.currency, (hold at time zone 'America/Sao_Paulo')::date, hold)
  returning * into pay;
  return public.pay_payment_json(pay, false);
end;
$$;

drop function if exists public.admin_set_pay_pilot_authorization(uuid, uuid, timestamptz, boolean);
drop function if exists public.pay_my_pilot_requests();
drop function if exists public.pay_charge_allowed(uuid, uuid);
drop function if exists public.pay_pilot_authorized(uuid, uuid);
drop table if exists public.pay_pilot_authorizations;
drop function if exists public.pay_pilot_touch();

revoke all on function public.pay_insert_guard() from public, anon, authenticated;
revoke all on function public.pay_prepare_appointment_payment(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.pay_prepare_appointment_payment(uuid, uuid, uuid, integer) to service_role;

commit;
