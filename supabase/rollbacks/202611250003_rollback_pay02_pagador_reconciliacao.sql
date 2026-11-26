-- Reversao da PAY-02 (202611250003). Remove SOMENTE o que a PAY-02 criou; a PAY-01 permanece intacta.
-- ATENCAO: apaga pay_payer_profiles e pay_reconciliation_log. Antes, exporte as pendencias abertas
-- (select * from public.pay_open_reviews()). Nao altera appointment_payments nem eventos financeiros.
drop trigger if exists appointment_payment_events_review on public.appointment_payment_events;
drop function if exists public.pay_review_on_event();
drop trigger if exists appointment_payments_review_on_change on public.appointment_payments;
drop trigger if exists appointment_payments_insert_guard on public.appointment_payments;
drop function if exists public.pay_release_expired_hold(uuid, timestamptz);
drop function if exists public.pay_unknown_charges(jsonb);
drop function if exists public.pay_list_expired_unpaid(timestamptz);
drop function if exists public.pay_list_reconcilable(timestamptz, integer);
drop function if exists public.pay_review_on_change();
drop function if exists public.pay_resolve_review(bigint, text);
drop function if exists public.pay_open_reviews();
drop function if exists public.pay_log_review(uuid, text, text, jsonb);
drop table if exists public.pay_reconciliation_log;
drop function if exists public.pay_save_payer(uuid, text, text, text);
drop function if exists public.pay_get_payer(uuid);
drop table if exists public.pay_payer_profiles;
drop function if exists public.pay_insert_guard();
drop trigger if exists pay_runtime_settings_touch on public.pay_runtime_settings;
drop function if exists public.pay_settings_touch();
drop function if exists public.pay_charges_enabled();
drop table if exists public.pay_runtime_settings;
