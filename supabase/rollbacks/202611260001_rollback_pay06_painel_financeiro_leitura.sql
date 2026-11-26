-- Rollback da PAY-06: remove somente as tres funcoes de leitura. Nao toca em tabelas nem em dados.
drop function if exists public.admin_list_appointment_payment_events(uuid);
drop function if exists public.admin_list_appointment_payments(text, integer);
drop function if exists public.admin_pay_overview();
