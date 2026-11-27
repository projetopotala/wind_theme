-- PAY-10: gestao Owner-only de precos de atendimentos e autorizacoes do piloto Pix na Central.
--
-- Nao abre charges_enabled, nao cria cobranca e nao concede acesso direto as tabelas.
-- Toda escrita passa por RPC SECURITY DEFINER, exige o unico Owner ativo e deixa auditoria em op_records/audit_events.

create function public.pay_admin_offering_is_test(p_offering jsonb, p_professional jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_offering ->> 'title', '') ~* '(teste|demo|demonstra)'
      or coalesce(p_offering ->> 'name', '') ~* '(teste|demo|demonstra)'
      or coalesce(p_professional ->> 'display_name', '') ~* '(teste|demo|demonstra)'
      or coalesce(p_professional ->> 'name', '') ~* '(teste|demo|demonstra)'
$$;

create function public.admin_list_appointment_service_prices()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner administra precos de atendimentos.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'offering_id', o.id,
    'title', coalesce(nullif(btrim(o.document ->> 'title'), ''), o.id),
    'published', coalesce((o.document ->> 'published')::boolean, false),
    'professional_name', coalesce(nullif(btrim(p.document ->> 'display_name'), ''), 'Profissional nao identificado'),
    'professional_eligible', p.id is not null
      and coalesce((p.document ->> 'active')::boolean, true)
      and coalesce((p.document ->> 'published')::boolean, false)
      and coalesce(p.document -> 'roles', '[]'::jsonb) ? 'professional',
    'test_or_demo', public.pay_admin_offering_is_test(o.document, p.document),
    'amount_cents', sp.amount_cents,
    'currency', coalesce(sp.currency, 'BRL'),
    'price_active', coalesce(sp.active, false),
    'updated_at', sp.updated_at
  ) order by lower(coalesce(nullif(btrim(o.document ->> 'title'), ''), o.id))), '[]'::jsonb)
    into v_result
  from public.op_records o
  left join public.op_records p
    on p.collection = 'profiles' and p.id = nullif(btrim(o.document ->> 'professional_id'), '')
  left join public.appointment_service_prices sp on sp.offering_id = o.id
  where o.collection = 'activity_offerings'
    and coalesce((o.document ->> 'active')::boolean, true);

  return v_result;
end;
$$;

create function public.admin_set_appointment_service_price(
  p_offering_id text, p_amount_cents integer, p_active boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_offering public.op_records;
  v_professional public.op_records;
  v_before public.appointment_service_prices;
  v_after public.appointment_service_prices;
  v_audit_id text := gen_random_uuid()::text;
  v_actor_name text;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner administra precos de atendimentos.' using errcode = '42501';
  end if;
  if p_offering_id is null or char_length(btrim(p_offering_id)) not between 1 and 160
     or p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 99999999
     or p_active is null then
    raise exception 'Preco de atendimento invalido.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('appointment-price:' || btrim(p_offering_id), 0));
  select * into v_offering from public.op_records
   where collection = 'activity_offerings' and id = btrim(p_offering_id)
     and coalesce((document ->> 'active')::boolean, true);
  if not found then raise exception 'Oferta nao encontrada ou inativa.' using errcode = 'P0002'; end if;

  select * into v_professional from public.op_records
   where collection = 'profiles' and id = nullif(btrim(v_offering.document ->> 'professional_id'), '');
  if not found
     or not coalesce((v_professional.document ->> 'active')::boolean, true)
     or not coalesce((v_professional.document ->> 'published')::boolean, false)
     or not (coalesce(v_professional.document -> 'roles', '[]'::jsonb) ? 'professional') then
    raise exception 'A oferta nao possui profissional ativo e publicado.' using errcode = '22023';
  end if;
  if public.pay_admin_offering_is_test(v_offering.document, v_professional.document) then
    raise exception 'Ofertas de teste ou demonstracao nao podem receber preco.' using errcode = '22023';
  end if;

  select * into v_before from public.appointment_service_prices where offering_id = v_offering.id;
  insert into public.appointment_service_prices (offering_id, amount_cents, currency, active, updated_at)
  values (v_offering.id, p_amount_cents, 'BRL', p_active, now())
  on conflict (offering_id) do update set
    amount_cents = excluded.amount_cents, currency = 'BRL', active = excluded.active, updated_at = excluded.updated_at
  returning * into v_after;

  if v_before is null or (v_before.amount_cents, v_before.currency, v_before.active)
      is distinct from (v_after.amount_cents, v_after.currency, v_after.active) then
    select coalesce(nullif(btrim(name), ''), 'Owner') into v_actor_name from public.users where id = v_actor;
    insert into public.op_records (collection, id, document, updated_at) values (
      'audit_events', v_audit_id, jsonb_build_object(
        'id', v_audit_id, 'actor', coalesce(v_actor_name, 'Owner'), 'actor_id', v_actor,
        'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'action', 'appointment_price.changed', 'reason', 'Central Financeira',
        'changes', jsonb_build_array(jsonb_build_object(
          'table', 'appointment_service_prices', 'id', v_offering.id,
          'before', case when v_before is null then null else jsonb_build_object('amount_cents', v_before.amount_cents, 'currency', v_before.currency, 'active', v_before.active) end,
          'after', jsonb_build_object('amount_cents', v_after.amount_cents, 'currency', v_after.currency, 'active', v_after.active)
        ))
      ), clock_timestamp());
  end if;

  return jsonb_build_object('offering_id', v_after.offering_id, 'amount_cents', v_after.amount_cents,
    'currency', v_after.currency, 'active', v_after.active, 'updated_at', v_after.updated_at);
end;
$$;

create function public.admin_list_pay_pilot_candidates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner administra o piloto Pix.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id', r.id,
    'user_id', r.requester_user_id,
    'client_name', coalesce(nullif(btrim(u.name), ''), nullif(btrim(au.raw_user_meta_data ->> 'full_name'), ''), 'Cliente ' || left(r.requester_user_id::text, 8)),
    'offering_id', r.offering_id,
    'offering_title', coalesce(nullif(btrim(o.document ->> 'title'), ''), nullif(btrim(r.service), ''), 'Atendimento'),
    'request_status', r.status,
    'slot_starts_at', s.starts_at,
    'payment_status', pay.status,
    'authorization_state', case when a.request_id is null then 'none' when not a.enabled then 'revoked' when a.expires_at <= now() then 'expired' else 'active' end,
    'authorization_expires_at', a.expires_at,
    'eligible', r.status in ('recebida','em_contato') and r.reservation_schedule_id is null
      and s.id is not null and s.status = 'held' and s.held_by_request_id = r.id and s.starts_at > now()
      and sp.offering_id is not null and pay.id is null,
    'ineligible_reason', case
      when r.status not in ('recebida','em_contato') then 'Pedido fora da etapa de pagamento.'
      when r.reservation_schedule_id is not null then 'Atendimento ja confirmado na agenda.'
      when s.id is null then 'Pedido sem horario reservado.'
      when s.status <> 'held' or s.held_by_request_id is distinct from r.id then 'Horario nao esta reservado para este pedido.'
      when s.starts_at <= now() then 'Horario reservado ja venceu.'
      when sp.offering_id is null then 'Oferta sem preco ativo.'
      when pay.id is not null then 'Ja existe uma cobranca para este pedido.'
      else null end
  ) order by coalesce(s.starts_at, r.created_at) asc), '[]'::jsonb) into v_result
  from public.appointment_requests r
  left join auth.users au on au.id = r.requester_user_id
  left join public.users u on u.id = r.requester_user_id
  left join public.op_records o on o.collection = 'activity_offerings' and o.id = r.offering_id
  left join public.appointment_slots s on s.id = r.appointment_slot_id
  left join public.appointment_service_prices sp on sp.offering_id = r.offering_id and sp.active
  left join public.pay_pilot_authorizations a on a.request_id = r.id
  left join lateral (
    select p.id, p.status from public.appointment_payments p
     where p.request_id = r.id and p.status in ('criando','aguardando_pagamento','em_processamento','confirmado','recebido','vencido','em_contestacao','divergente')
     order by p.created_at desc limit 1
  ) pay on true
  where r.requester_user_id is not null
    and (r.status in ('recebida','em_contato') or a.request_id is not null or pay.id is not null)
  limit 100;
  return v_result;
end;
$$;

-- Fortalece a RPC PAY-08: ao conceder, valida toda a elegibilidade no servidor e audita a mudanca.
create or replace function public.admin_set_pay_pilot_authorization(
  p_request_id uuid, p_user_id uuid, p_expires_at timestamptz, p_enabled boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_request public.appointment_requests;
  v_slot public.appointment_slots;
  v_before public.pay_pilot_authorizations;
  v_after public.pay_pilot_authorizations;
  v_audit_id text := gen_random_uuid()::text;
  v_actor_name text;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner administra o piloto Pix.' using errcode = '42501';
  end if;
  if p_request_id is null or p_user_id is null or p_enabled is null or (p_enabled and p_expires_at is null) then
    raise exception 'Autorizacao piloto invalida.' using errcode = '22023';
  end if;

  select * into v_request from public.appointment_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitacao nao encontrada.' using errcode = 'P0002'; end if;
  if v_request.requester_user_id is distinct from p_user_id then
    raise exception 'A solicitacao nao pertence ao cliente informado.' using errcode = '22023';
  end if;

  select * into v_before from public.pay_pilot_authorizations where request_id = p_request_id for update;
  if p_enabled then
    if p_expires_at <= now() then raise exception 'A autorizacao deve expirar no futuro.' using errcode = '22023'; end if;
    if v_request.status not in ('recebida','em_contato') or v_request.reservation_schedule_id is not null or v_request.appointment_slot_id is null then
      raise exception 'A solicitacao nao esta elegivel para o piloto Pix.' using errcode = '22023';
    end if;
    select * into v_slot from public.appointment_slots where id = v_request.appointment_slot_id for update;
    if not found or v_slot.status <> 'held' or v_slot.held_by_request_id is distinct from v_request.id or v_slot.starts_at <= now() then
      raise exception 'O horario nao esta reservado para esta solicitacao.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.appointment_service_prices where offering_id = v_request.offering_id and active) then
      raise exception 'A oferta ainda nao possui preco ativo.' using errcode = '22023';
    end if;
    if exists (select 1 from public.appointment_payments where request_id = v_request.id
      and status in ('criando','aguardando_pagamento','em_processamento','confirmado','recebido','vencido','em_contestacao','divergente')) then
      raise exception 'O pedido ja possui cobranca.' using errcode = 'PT409';
    end if;
  elsif v_before is null then
    raise exception 'A solicitacao nao possui autorizacao para revogar.' using errcode = 'P0002';
  end if;

  insert into public.pay_pilot_authorizations (request_id, user_id, expires_at, enabled, created_by)
  values (p_request_id, p_user_id, coalesce(p_expires_at, v_before.expires_at), p_enabled, v_actor)
  on conflict (request_id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at, enabled = excluded.enabled
  returning * into v_after;

  if v_before is null or (v_before.user_id, v_before.expires_at, v_before.enabled)
      is distinct from (v_after.user_id, v_after.expires_at, v_after.enabled) then
    select coalesce(nullif(btrim(name), ''), 'Owner') into v_actor_name from public.users where id = v_actor;
    insert into public.op_records (collection, id, document, updated_at) values (
      'audit_events', v_audit_id, jsonb_build_object(
        'id', v_audit_id, 'actor', coalesce(v_actor_name, 'Owner'), 'actor_id', v_actor,
        'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'action', case when p_enabled then 'pay_pilot.authorized' else 'pay_pilot.revoked' end,
        'reason', 'Central Financeira',
        'changes', jsonb_build_array(jsonb_build_object(
          'table', 'pay_pilot_authorizations', 'id', p_request_id,
          'before', case when v_before is null then null else jsonb_build_object('enabled', v_before.enabled, 'expires_at', v_before.expires_at) end,
          'after', jsonb_build_object('enabled', v_after.enabled, 'expires_at', v_after.expires_at)
        ))
      ), clock_timestamp());
  end if;

  return jsonb_build_object('request_id', v_after.request_id, 'user_id', v_after.user_id,
    'expires_at', v_after.expires_at, 'enabled', v_after.enabled);
end;
$$;

-- A Central usa esta porta sem receber um user_id editavel. O servidor deriva o cliente do pedido.
create function public.admin_set_pay_pilot_authorization_for_request(
  p_request_id uuid, p_expires_at timestamptz, p_enabled boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_user_id uuid; v_expires_at timestamptz;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner administra o piloto Pix.' using errcode = '42501';
  end if;
  select requester_user_id into v_user_id from public.appointment_requests where id = p_request_id;
  if not found or v_user_id is null then raise exception 'Solicitacao autenticada nao encontrada.' using errcode = 'P0002'; end if;
  if not p_enabled then
    select expires_at into v_expires_at from public.pay_pilot_authorizations where request_id = p_request_id;
  else v_expires_at := p_expires_at;
  end if;
  return public.admin_set_pay_pilot_authorization(p_request_id, v_user_id, v_expires_at, p_enabled);
end;
$$;

revoke all on function public.pay_admin_offering_is_test(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.admin_list_appointment_service_prices() from public, anon, authenticated;
revoke all on function public.admin_set_appointment_service_price(text,integer,boolean) from public, anon, authenticated;
revoke all on function public.admin_list_pay_pilot_candidates() from public, anon, authenticated;
revoke all on function public.admin_set_pay_pilot_authorization_for_request(uuid,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.admin_list_appointment_service_prices() to authenticated;
grant execute on function public.admin_set_appointment_service_price(text,integer,boolean) to authenticated;
grant execute on function public.admin_list_pay_pilot_candidates() to authenticated;
grant execute on function public.admin_set_pay_pilot_authorization_for_request(uuid,timestamptz,boolean) to authenticated;
