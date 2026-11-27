-- PAY-11 rollback: fecha o modo por oferta e restaura a autorizacao exclusiva do piloto.
drop function if exists public.admin_set_pay_offering_policy(text,boolean,boolean);
drop function if exists public.pay_my_appointment_payment_options();
drop function if exists public.pay_normal_offering_authorized(uuid,uuid);
create or replace function public.pay_charge_allowed(p_user_id uuid,p_request_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.pay_charges_enabled() and public.pay_pilot_authorized(p_user_id,p_request_id)
$$;
revoke all on function public.pay_charge_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pay_charge_allowed(uuid,uuid) to service_role;
drop table if exists public.pay_offering_policies;
