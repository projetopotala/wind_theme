-- Reversao da PAY-01 (202611250002_pay01_pagamentos_atendimento.sql). NAO executar automaticamente.
--
-- Registros financeiros sao auditoria e NUNCA sao apagados por este script: se existir qualquer cobranca ou evento, a
-- reversao aborta. Nesse caso exporte e arquive os registros (decisao do Owner) antes de remover as tabelas.
-- Sem registros, remove funcoes, gatilhos e tabelas criados pela PAY-01, na ordem inversa das dependencias.
-- Nao toca appointment_requests, appointment_slots nem qualquer objeto anterior a PAY-01.

begin;

do $$
begin
  if to_regclass('public.appointment_payments') is not null and exists (select 1 from public.appointment_payments) then
    raise exception 'pay01-rollback: existem cobrancas registradas; arquive-as antes de remover as tabelas';
  end if;
  if to_regclass('public.appointment_payment_events') is not null and exists (select 1 from public.appointment_payment_events) then
    raise exception 'pay01-rollback: existem eventos de pagamento registrados; arquive-os antes de remover as tabelas';
  end if;
end;
$$;

drop function if exists public.pay_payment_allows_confirmation(uuid);
drop function if exists public.pay_list_expired_holds(timestamptz);
drop function if exists public.pay_apply_webhook_event(text, text, text, text, text, integer, integer, text, text);
drop function if exists public.pay_fail_creation(uuid, text);
drop function if exists public.pay_register_provider_charge(uuid, text, text, timestamptz);
drop function if exists public.pay_prepare_appointment_payment(uuid, uuid, uuid, integer);
drop function if exists public.pay_payment_json(public.appointment_payments, boolean);
drop function if exists public.pay_next_state(text, text);
drop function if exists public.pay_transition_allowed(text, text);
drop function if exists public.pay_state_rank(text);
drop function if exists public.pay_state_clears_reservation(text);

drop table if exists public.appointment_payment_events;
drop table if exists public.appointment_payments;
drop table if exists public.appointment_service_prices;

drop function if exists public.pay_event_append_only();
drop function if exists public.pay_payment_guard();

do $$
begin
  if to_regclass('public.appointment_payments') is not null or to_regprocedure('public.pay_next_state(text,text)') is not null then
    raise exception 'pay01-rollback: a reversao nao removeu todos os objetos';
  end if;
end;
$$;

commit;
