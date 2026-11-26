-- PAY-08: autorizacao restrita do primeiro Pix real por solicitacao e cliente.
-- A tabela nasce vazia. A chave global continua fechada; somente uma autorizacao
-- vigente, criada pelo Owner ativo, permite uma nova cobranca para o par exato.

create table public.pay_pilot_authorizations (
  request_id uuid primary key references public.appointment_requests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  enabled boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pay_pilot_authorizations enable row level security;
revoke all on table public.pay_pilot_authorizations from public, anon, authenticated;

create function public.pay_pilot_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger pay_pilot_touch before update on public.pay_pilot_authorizations
  for each row execute function public.pay_pilot_touch();

create function public.pay_pilot_authorized(p_user_id uuid, p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and p_request_id is not null and exists (
    select 1
      from public.pay_pilot_authorizations a
      join public.appointment_requests r on r.id = a.request_id
     where a.request_id = p_request_id
       and a.user_id = p_user_id
       and r.requester_user_id = p_user_id
       and a.enabled
       and a.expires_at > now()
  )
$$;

-- A chave global continua soberana. O piloto apenas abre o par exato pedido/cliente.
create function public.pay_charge_allowed(p_user_id uuid, p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.pay_charges_enabled() or public.pay_pilot_authorized(p_user_id, p_request_id)
$$;

-- Lista minima para o proprio cliente: sem dados administrativos e sem acesso direto a tabela.
create function public.pay_my_pilot_requests() returns table (request_id uuid, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.request_id, a.expires_at
    from public.pay_pilot_authorizations a
    join public.appointment_requests r on r.id = a.request_id
   where a.user_id = (select auth.uid())
     and r.requester_user_id = (select auth.uid())
     and a.enabled
     and a.expires_at > now()
$$;

-- Unica porta administrativa. Nem admin nem o proprio cliente podem autorizar o piloto.
create function public.admin_set_pay_pilot_authorization(
  p_request_id uuid, p_user_id uuid, p_expires_at timestamptz, p_enabled boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_request_user uuid;
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
  on conflict (request_id) do update
    set user_id = excluded.user_id, expires_at = excluded.expires_at, enabled = excluded.enabled;
  return jsonb_build_object('request_id', p_request_id, 'user_id', p_user_id,
    'expires_at', p_expires_at, 'enabled', p_enabled);
end;
$$;

-- A trava fisica da tabela continua ativa mesmo para service_role.
create or replace function public.pay_insert_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pay_charge_allowed(new.client_id, new.request_id) then
    raise exception 'Cobrancas ainda nao autorizadas.' using errcode = 'PT503';
  end if;
  return new;
end;
$$;

-- Mesma preparacao PAY-01, acrescida da verificacao do piloto no servidor.
-- Um pagamento ja iniciado continua recuperavel apos revogacao; nenhuma nova
-- linha financeira nasce sem a autorizacao vigente.
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
  if not public.pay_charge_allowed(p_user_id, p_request_id) then
    raise exception 'Cobrancas ainda nao autorizadas.' using errcode = 'PT503';
  end if;
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

revoke all on function public.pay_pilot_touch() from public, anon, authenticated;
revoke all on function public.pay_pilot_authorized(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pay_charge_allowed(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pay_insert_guard() from public, anon, authenticated;
revoke all on function public.pay_prepare_appointment_payment(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.pay_my_pilot_requests() from public, anon;
grant execute on function public.pay_my_pilot_requests() to authenticated;
revoke all on function public.admin_set_pay_pilot_authorization(uuid, uuid, timestamptz, boolean) from public, anon;
grant execute on function public.admin_set_pay_pilot_authorization(uuid, uuid, timestamptz, boolean) to authenticated;
grant execute on function public.pay_pilot_authorized(uuid, uuid) to service_role;
grant execute on function public.pay_charge_allowed(uuid, uuid) to service_role;
grant execute on function public.pay_prepare_appointment_payment(uuid, uuid, uuid, integer) to service_role;

