-- Remove somente as portas PAY-10. Precos, autorizacoes e auditorias existentes sao preservados.
drop function if exists public.admin_set_pay_pilot_authorization_for_request(uuid,timestamptz,boolean);
drop function if exists public.admin_list_pay_pilot_candidates();
drop function if exists public.admin_set_appointment_service_price(text,integer,boolean);
drop function if exists public.admin_list_appointment_service_prices();
drop function if exists public.pay_admin_offering_is_test(jsonb,jsonb);

-- Restaura a RPC PAY-08 original (Owner + vinculo request/user + validade; sem as guardas administrativas PAY-10).
create or replace function public.admin_set_pay_pilot_authorization(
  p_request_id uuid, p_user_id uuid, p_expires_at timestamptz, p_enabled boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_request_user uuid;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner administra o piloto Pix.' using errcode = '42501';
  end if;
  if p_request_id is null or p_user_id is null or p_expires_at is null or p_enabled is null then
    raise exception 'Autorizacao piloto invalida.' using errcode = '22023';
  end if;
  select requester_user_id into v_request_user from public.appointment_requests where id = p_request_id;
  if not found then raise exception 'Solicitacao nao encontrada.' using errcode = 'P0002'; end if;
  if v_request_user is distinct from p_user_id then
    raise exception 'A solicitacao nao pertence ao cliente informado.' using errcode = '22023';
  end if;
  if p_enabled and p_expires_at <= now() then
    raise exception 'A autorizacao deve expirar no futuro.' using errcode = '22023';
  end if;
  insert into public.pay_pilot_authorizations (request_id, user_id, expires_at, enabled, created_by)
  values (p_request_id, p_user_id, p_expires_at, p_enabled, v_actor)
  on conflict (request_id) do update set user_id=excluded.user_id, expires_at=excluded.expires_at, enabled=excluded.enabled;
  return jsonb_build_object('request_id',p_request_id,'user_id',p_user_id,'expires_at',p_expires_at,'enabled',p_enabled);
end;
$$;
revoke all on function public.admin_set_pay_pilot_authorization(uuid,uuid,timestamptz,boolean) from public, anon;
grant execute on function public.admin_set_pay_pilot_authorization(uuid,uuid,timestamptz,boolean) to authenticated;
