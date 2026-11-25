-- PAY-02: pagador (CPF/CNPJ minimizado), chave geral de cobrancas, reconciliacao e liberacao de reservas nao pagas.
-- SOMENTE ADITIVA sobre a PAY-01 (202611250002). NAO aplicar em nenhum Supabase sem autorizacao expressa do Owner.
--
-- O que cria:
--   * pay_runtime_settings: chave geral "charges_enabled", NASCE DESLIGADA. Um gatilho em appointment_payments recusa
--     qualquer linha nova enquanto ela estiver desligada (PT503). Ligar e um ato do Owner, no banco, separado do deploy.
--   * pay_payer_profiles: id do cliente no Asaas + tipo e ULTIMOS 4 digitos do documento. O documento completo NUNCA e
--     gravado aqui (so e enviado ao Asaas uma vez, na criacao do cliente). Sem acesso para anon; authenticated le so o proprio.
--   * pay_reconciliation_log: pendencias de revisao manual (orfas, divergencias, pagamento sem atendimento...).
--     Nunca guarda documento, nome, e-mail nem Pix; so ids tecnicos e motivos.
--   * pay_list_reconcilable / pay_list_expired_unpaid / pay_unknown_charges: listas para o reconciliador (service_role).
--   * pay_release_expired_hold: libera o horario de uma reserva nao paga, SOMENTE se a cobranca estiver cancelada
--     (cancelamento confirmado ou comprovadamente nunca criada) e o prazo vencido. Nunca com cobranca ainda viva.
-- Nenhuma funcao financeira e executavel por anon ou authenticated.
-- Reversao: supabase/rollbacks/202611250003_rollback_pay02_pagador_reconciliacao.sql

do $$
begin
  if to_regclass('public.appointment_payments') is null or to_regclass('public.appointment_payment_events') is null
     or to_regclass('public.appointment_requests') is null or to_regclass('public.appointment_slots') is null
     or to_regclass('public.appointment_request_events') is null or to_regprocedure('public.pay_apply_webhook_event(text,text,text,text,text,integer,integer,text,text)') is null then
    raise exception 'pay02: pre-requisitos ausentes (aplicar antes a PAY-01, 202611250002)';
  end if;
end;
$$;

-- 1) Chave geral. Desligada por padrao; so o Owner liga (UPDATE como postgres no SQL Editor).
create table public.pay_runtime_settings (
  singleton boolean primary key default true check (singleton),
  charges_enabled boolean not null default false,
  note text check (note is null or char_length(note) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.pay_runtime_settings (singleton, charges_enabled) values (true, false);
alter table public.pay_runtime_settings enable row level security;
revoke all on table public.pay_runtime_settings from public, anon, authenticated;

create function public.pay_charges_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.charges_enabled from public.pay_runtime_settings s where s.singleton), false)
$$;

create function public.pay_settings_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger pay_runtime_settings_touch before update on public.pay_runtime_settings
  for each row execute function public.pay_settings_touch();

-- Nenhuma cobranca nova nasce enquanto a chave estiver desligada (vale tambem para service_role).
create function public.pay_insert_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.pay_charges_enabled() then
    raise exception 'Cobrancas ainda nao autorizadas.' using errcode = 'PT503';
  end if;
  return new;
end;
$$;
create trigger appointment_payments_insert_guard before insert on public.appointment_payments
  for each row execute function public.pay_insert_guard();

-- 2) Pagador: minimizacao. Sem documento completo, sem nome, sem e-mail.
create table public.pay_payer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  asaas_customer_id text not null unique check (char_length(asaas_customer_id) between 1 and 120),
  document_kind text not null check (document_kind in ('cpf', 'cnpj')),
  document_last4 text not null check (document_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);
alter table public.pay_payer_profiles enable row level security;
revoke all on table public.pay_payer_profiles from public, anon, authenticated;
grant select (user_id, document_kind, document_last4, created_at) on public.pay_payer_profiles to authenticated;
create policy pay_payer_profiles_select_proprio on public.pay_payer_profiles
  for select to authenticated using (user_id = (select auth.uid()));

create function public.pay_get_payer(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('asaas_customer_id', p.asaas_customer_id, 'document_kind', p.document_kind, 'document_last4', p.document_last4)
  from public.pay_payer_profiles p where p.user_id = p_user_id
$$;

-- Idempotente para o mesmo cliente do Asaas; nunca troca silenciosamente o vinculo existente.
create function public.pay_save_payer(p_user_id uuid, p_asaas_customer_id text, p_kind text, p_last4 text) returns void
language plpgsql security definer set search_path = '' as $$
declare atual text;
begin
  if p_user_id is null or p_asaas_customer_id is null or p_kind not in ('cpf', 'cnpj') or p_last4 !~ '^[0-9]{4}$' then
    raise exception 'Pagador invalido.' using errcode = '22023';
  end if;
  select asaas_customer_id into atual from public.pay_payer_profiles where user_id = p_user_id for update;
  if found then
    if atual <> p_asaas_customer_id then
      raise exception 'O pagador ja esta vinculado a outro cliente do provedor.' using errcode = '23503';
    end if;
    return;
  end if;
  insert into public.pay_payer_profiles (user_id, asaas_customer_id, document_kind, document_last4)
  values (p_user_id, p_asaas_customer_id, p_kind, p_last4);
end;
$$;

-- 3) Pendencias de revisao manual (Owner). Sem dados pessoais.
create table public.pay_reconciliation_log (
  id bigint generated always as identity primary key,
  payment_id uuid references public.appointment_payments (id) on delete restrict,
  provider_payment_id text check (provider_payment_id is null or char_length(provider_payment_id) <= 120),
  kind text not null check (kind in (
    'sem_id_no_provedor', 'multiplas_no_provedor', 'orfa_no_provedor', 'divergencia_status', 'divergencia_financeira',
    'pago_sem_atendimento', 'revisao_financeira', 'hold_expirado_sem_id', 'falha_cancelamento_hold', 'liberacao_bloqueada')),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_note text check (resolved_note is null or char_length(resolved_note) <= 300)
);
create index pay_reconciliation_log_abertas on public.pay_reconciliation_log (created_at) where resolved_at is null;
alter table public.pay_reconciliation_log enable row level security;
revoke all on table public.pay_reconciliation_log from public, anon, authenticated;

-- Abre uma pendencia UMA vez por (pagamento ou id externo, tipo) enquanto estiver aberta. Devolve true se abriu.
create function public.pay_log_review(p_payment_id uuid, p_provider_payment_id text, p_kind text, p_detail jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.pay_reconciliation_log l
             where l.kind = p_kind and l.resolved_at is null
               and l.payment_id is not distinct from p_payment_id
               and l.provider_payment_id is not distinct from p_provider_payment_id) then
    return false;
  end if;
  insert into public.pay_reconciliation_log (payment_id, provider_payment_id, kind, detail)
  values (p_payment_id, p_provider_payment_id, p_kind, coalesce(p_detail, '{}'::jsonb));
  return true;
end;
$$;

create function public.pay_open_reviews() returns table (id bigint, payment_id uuid, provider_payment_id text, kind text, detail jsonb, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.payment_id, l.provider_payment_id, l.kind, l.detail, l.created_at
  from public.pay_reconciliation_log l where l.resolved_at is null order by l.created_at
$$;

-- Fechar uma pendencia e decisao do Owner (service_role / SQL Editor); nada aqui reembolsa ou cancela dinheiro.
create function public.pay_resolve_review(p_id bigint, p_note text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_note is null or char_length(btrim(p_note)) = 0 or char_length(p_note) > 300 then
    raise exception 'Informe a justificativa da revisao (ate 300 caracteres).' using errcode = '22023';
  end if;
  update public.pay_reconciliation_log set resolved_at = now(), resolved_note = p_note
   where id = p_id and resolved_at is null;
  return found;
end;
$$;

-- Pagamento sem atendimento disponivel, divergencia e estorno em curso abrem revisao automaticamente.
create function public.pay_review_on_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reservation_outcome is distinct from old.reservation_outcome then
    if new.reservation_outcome = 'pagamento_tardio' then
      perform public.pay_log_review(new.id, new.provider_payment_id, 'pago_sem_atendimento', jsonb_build_object('status', new.status));
    elsif new.reservation_outcome = 'revisao' then
      perform public.pay_log_review(new.id, new.provider_payment_id, 'revisao_financeira', jsonb_build_object('status', new.status));
    end if;
  end if;
  if new.status = 'divergente' and old.status is distinct from 'divergente' then
    perform public.pay_log_review(new.id, new.provider_payment_id, 'divergencia_financeira', jsonb_build_object('de', old.status));
  end if;
  return new;
end;
$$;
create trigger appointment_payments_review_on_change after update on public.appointment_payments
  for each row execute function public.pay_review_on_change();

-- Dinheiro que chega e o sistema nao consegue encaixar vira revisao, nunca fica so como evento "obsoleto":
--   * PAYMENT_RECEIVED/CONFIRMED que chega 'obsoleto' sobre cobranca cancelada ou estornada (um CONFIRMED atrasado sobre
--     uma cobranca ja recebida e fora de ordem NORMAL e nao abre revisao; cancelada + RECEIVED vira 'divergente', que ja abre);
--   * PAYMENT_RECEIVED/CONFIRMED sem nenhuma cobranca correspondente no banco ('sem_correspondencia').
create function public.pay_review_on_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED') then
    if new.outcome = 'obsoleto' and new.payment_id is not null and new.from_status in ('cancelado', 'estornado') then
      perform public.pay_log_review(new.payment_id, new.provider_payment_id, 'divergencia_status', jsonb_build_object('evento', new.event, 'de', new.from_status));
    elsif new.outcome = 'sem_correspondencia' then
      perform public.pay_log_review(null, new.provider_payment_id, 'orfa_no_provedor', jsonb_build_object('evento', new.event));
    end if;
  end if;
  return new;
end;
$$;
create trigger appointment_payment_events_review after insert on public.appointment_payment_events
  for each row execute function public.pay_review_on_event();

-- 4) Listas para o reconciliador. Nenhuma delas cria, cancela ou altera cobranca.
create function public.pay_list_reconcilable(p_now timestamptz default now(), p_min_age_minutes integer default 10)
returns table (payment_id uuid, provider_payment_id text, external_reference text, status text, amount_cents integer, pix_ready boolean, motivo text)
language sql stable security definer set search_path = '' as $$
  select x.payment_id, x.provider_payment_id, x.external_reference, x.status, x.amount_cents, x.pix_ready, x.motivo
  from (
    select p.id as payment_id, p.provider_payment_id, p.external_reference, p.status, p.amount_cents,
           (p.pix_copy_paste is not null) as pix_ready, p.created_at,
           case
             when p.provider_payment_id is null then 'sem_id'
             when p.pix_copy_paste is null and p.status in ('criando', 'aguardando_pagamento') then 'sem_qr'
             else 'conferir'
           end as motivo
    from public.appointment_payments p
    where (p.provider_payment_id is null and p.status = 'criando'
             and p.created_at < p_now - make_interval(mins => greatest(p_min_age_minutes, 1)))
       or (p.provider_payment_id is not null and p.pix_copy_paste is null and p.status in ('criando', 'aguardando_pagamento')
             and p.created_at < p_now - make_interval(mins => least(greatest(p_min_age_minutes, 1), 2)))
       or (p.provider_payment_id is not null and p.status in ('aguardando_pagamento', 'em_processamento', 'confirmado', 'vencido', 'em_contestacao')
             and coalesce(p.last_event_at, p.created_at) < p_now - make_interval(mins => greatest(p_min_age_minutes, 1)))
  ) x order by x.created_at limit 200
$$;

-- Reservas com prazo vencido que ainda nao estao pagas. 'em_processamento'/'confirmado' ficam de fora de proposito:
-- ha pagamento em curso e o horario nao pode ser solto por baixo dele.
create function public.pay_list_expired_unpaid(p_now timestamptz default now())
returns table (payment_id uuid, request_id uuid, status text, provider_payment_id text, amount_cents integer, external_reference text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.request_id, p.status, p.provider_payment_id, p.amount_cents, p.external_reference
  from public.appointment_payments p
  where p.hold_expires_at < p_now
    and (p.status in ('criando', 'aguardando_pagamento', 'vencido')
         or (p.status = 'cancelado' and exists (
               select 1 from public.appointment_requests r join public.appointment_slots s on s.id = r.appointment_slot_id
                where r.id = p.request_id and r.status in ('recebida', 'em_contato')
                  and s.status = 'held' and s.held_by_request_id = r.id)))
  order by p.hold_expires_at limit 100
$$;

-- Entre as cobrancas vistas no Asaas, devolve as que o banco NAO conhece (nem pelo id, nem pela referencia externa).
create function public.pay_unknown_charges(p_items jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(i), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) i
  where not exists (select 1 from public.appointment_payments p
                    where p.provider_payment_id = i ->> 'id' or p.external_reference = i ->> 'ref')
$$;

-- 5) Libera o horario de uma reserva nao paga. Defesas: so com cobranca CANCELADA, prazo vencido, solicitacao ainda
--    aberta, nenhuma outra cobranca aberta. Devolve o motivo; nunca levanta erro por "nao foi possivel liberar".
create function public.pay_release_expired_hold(p_payment_id uuid, p_now timestamptz default now()) returns text
language plpgsql security definer set search_path = '' as $$
declare pay public.appointment_payments; r public.appointment_requests;
begin
  select * into pay from public.appointment_payments where id = p_payment_id for update;
  if not found then return 'inexistente'; end if;
  if pay.status <> 'cancelado' then return 'cobranca_nao_cancelada'; end if;
  if pay.hold_expires_at >= p_now then return 'prazo_nao_venceu'; end if;
  select * into r from public.appointment_requests where id = pay.request_id for update;
  if not found then return 'sem_solicitacao'; end if;
  if r.status not in ('recebida', 'em_contato') or r.reservation_schedule_id is not null then return 'solicitacao_ja_tratada'; end if;
  if exists (select 1 from public.appointment_payments o where o.request_id = r.id and o.id <> pay.id
             and o.status in ('criando', 'aguardando_pagamento', 'em_processamento', 'confirmado', 'recebido', 'vencido', 'em_contestacao', 'divergente')) then
    return 'outra_cobranca_aberta';
  end if;
  update public.appointment_requests set status = 'cancelada', cancelled_at = now(), cancelled_by = null where id = r.id;
  update public.appointment_slots set status = 'available', held_by_request_id = null, updated_at = now()
   where id = r.appointment_slot_id and status = 'held' and held_by_request_id = r.id;
  insert into public.appointment_request_events (request_id, actor_id, event_type, from_status, to_status)
  values (r.id, null, 'cancelled', r.status, 'cancelada');
  return 'liberada';
end;
$$;

-- 6) Privilegios: somente service_role executa; anon e authenticated nada.
revoke all on function public.pay_charges_enabled() from public, anon, authenticated;
revoke all on function public.pay_settings_touch() from public, anon, authenticated;
revoke all on function public.pay_insert_guard() from public, anon, authenticated;
revoke all on function public.pay_get_payer(uuid) from public, anon, authenticated;
revoke all on function public.pay_save_payer(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.pay_log_review(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.pay_open_reviews() from public, anon, authenticated;
revoke all on function public.pay_resolve_review(bigint, text) from public, anon, authenticated;
revoke all on function public.pay_review_on_change() from public, anon, authenticated;
revoke all on function public.pay_review_on_event() from public, anon, authenticated;
revoke all on function public.pay_list_reconcilable(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.pay_list_expired_unpaid(timestamptz) from public, anon, authenticated;
revoke all on function public.pay_unknown_charges(jsonb) from public, anon, authenticated;
revoke all on function public.pay_release_expired_hold(uuid, timestamptz) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.pay_payer_profiles to service_role';
    execute 'grant select on public.pay_reconciliation_log to service_role';
    execute 'grant execute on function public.pay_charges_enabled() to service_role';
    execute 'grant execute on function public.pay_get_payer(uuid) to service_role';
    execute 'grant execute on function public.pay_save_payer(uuid, text, text, text) to service_role';
    execute 'grant execute on function public.pay_log_review(uuid, text, text, jsonb) to service_role';
    execute 'grant execute on function public.pay_open_reviews() to service_role';
    execute 'grant execute on function public.pay_resolve_review(bigint, text) to service_role';
    execute 'grant execute on function public.pay_list_reconcilable(timestamptz, integer) to service_role';
    execute 'grant execute on function public.pay_list_expired_unpaid(timestamptz) to service_role';
    execute 'grant execute on function public.pay_unknown_charges(jsonb) to service_role';
    execute 'grant execute on function public.pay_release_expired_hold(uuid, timestamptz) to service_role';
  end if;
end;
$$;
