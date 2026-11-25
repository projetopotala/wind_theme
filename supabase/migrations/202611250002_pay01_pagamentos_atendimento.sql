-- PAY-01: base financeira dos pagamentos de atendimentos (Asaas). PREPARADA, NAO APLICADA em producao nem no LAB.
--
-- O que cria (so aditivo; nao altera appointment_requests, appointment_slots nem nenhuma funcao existente):
--   * appointment_service_prices: preco por oferta, definido SOMENTE no servidor. Nasce vazia e inativa: nenhum preco real
--     e cadastrado aqui (decisao de negocio pendente). Sem acesso para anon/authenticated.
--   * appointment_payments: uma cobranca por solicitacao (indice unico parcial impede cobranca aberta duplicada).
--     Estado financeiro SEPARADO do estado do agendamento. O cliente so le as proprias linhas (RLS) e so colunas seguras;
--     nunca escreve.
--   * appointment_payment_events: trilha append-only de eventos do Asaas, com o id do evento UNICO (idempotencia).
--   * pay_next_state(): maquina de estados (espelha supabase/functions/_shared/pagamentos/estados.ts; teste de paridade).
--   * pay_prepare_appointment_payment / pay_register_provider_charge / pay_fail_creation / pay_apply_webhook_event /
--     pay_list_expired_holds / pay_payment_allows_confirmation: TODAS restritas a service_role (Edge Functions).
--     Nenhuma funcao financeira e executavel por anon ou authenticated.
-- Decisoes de negocio ainda pendentes e como esta migration as trata:
--   * Pagamento "confirmado" (saldo nao disponivel) NAO libera o atendimento; so "recebido" (pay_state_clears_reservation).
--   * Esta migration NAO confirma agendamentos nem libera horarios. Ela so registra se o pagamento chegou com a reserva
--     valida ('elegivel') ou fora dela ('pagamento_tardio'). Ligar isso a confirm_appointment_request_reservation e a
--     liberacao do horario e a PAY-02, atras de flag.
-- Nenhuma chave de API fica no banco. Nenhum dado e alterado. Execute como postgres, em uma unica transacao, apos
-- aprovacao expressa do Owner (nao usar db push nem migration repair; o historico de migrations diverge).
-- Reversao: supabase/rollbacks/202611250002_rollback_pay01_pagamentos_atendimento.sql

begin;

do $$
begin
  if to_regclass('public.appointment_requests') is null or to_regclass('public.appointment_slots') is null
     or to_regclass('public.op_records') is null or to_regclass('auth.users') is null then
    raise exception 'pay01: pre-requisitos ausentes (appointment_requests, appointment_slots, op_records, auth.users)';
  end if;
end;
$$;

-- 1) Precos (somente servidor).
create table public.appointment_service_prices (
  offering_id text primary key check (char_length(btrim(offering_id)) between 1 and 160),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 99999999),
  currency text not null default 'BRL' check (currency = 'BRL'),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 2) Cobrancas.
create table public.appointment_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.appointment_requests (id) on delete restrict,
  client_id uuid not null references auth.users (id) on delete restrict,
  offering_id text not null,
  idempotency_key uuid not null unique,
  external_reference text not null unique,
  provider text not null default 'asaas' check (provider = 'asaas'),
  provider_payment_id text unique,
  billing_type text not null default 'PIX' check (billing_type = 'PIX'),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 99999999),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'criando' check (status in (
    'criando', 'aguardando_pagamento', 'em_processamento', 'confirmado', 'recebido',
    'vencido', 'cancelado', 'estornado', 'em_contestacao', 'divergente')),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 120),
  due_date date not null,
  hold_expires_at timestamptz not null,
  pix_copy_paste text,
  pix_expires_at timestamptz,
  confirmed_at timestamptz,
  received_at timestamptz,
  refunded_at timestamptz,
  reservation_outcome text not null default 'pendente'
    check (reservation_outcome in ('pendente', 'elegivel', 'pagamento_tardio', 'revisao')),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- "Aberta" = qualquer cobranca que ainda pode existir ou receber dinheiro no Asaas. Inclui 'vencido': um Pix vencido
-- ainda pode ser pago (o QR vale meses), entao o indice so e liberado por cancelamento comprovado (PAYMENT_DELETED ou
-- pay_fail_creation, que exige prova de que nada foi criado) ou por estorno. Nova cobranca exige reconciliacao.
create unique index appointment_payments_uma_aberta_por_solicitacao
  on public.appointment_payments (request_id)
  where status in ('criando', 'aguardando_pagamento', 'em_processamento', 'confirmado', 'recebido', 'vencido', 'em_contestacao', 'divergente');
create index appointment_payments_cliente on public.appointment_payments (client_id, created_at desc);

-- 3) Eventos (append-only).
create table public.appointment_payment_events (
  id bigint generated always as identity primary key,
  provider_event_id text not null unique check (char_length(provider_event_id) between 1 and 120),
  payment_id uuid references public.appointment_payments (id) on delete restrict,
  provider_payment_id text,
  event text not null check (event ~ '^[A-Z_]{3,80}$'),
  event_created text,
  provider_status text,
  value_cents integer,
  outcome text not null check (outcome in ('aplicado', 'sem_mudanca', 'obsoleto', 'divergencia', 'sem_correspondencia')),
  from_status text,
  to_status text,
  received_at timestamptz not null default now()
);
create index appointment_payment_events_pagamento on public.appointment_payment_events (payment_id, received_at);

alter table public.appointment_service_prices enable row level security;
alter table public.appointment_payments enable row level security;
alter table public.appointment_payment_events enable row level security;
revoke all on table public.appointment_service_prices from public, anon, authenticated;
revoke all on table public.appointment_payments from public, anon, authenticated;
revoke all on table public.appointment_payment_events from public, anon, authenticated;

-- O cliente le somente as proprias cobrancas e somente colunas sem identificadores internos do provedor.
grant select (id, request_id, offering_id, status, amount_cents, currency, billing_type, due_date, hold_expires_at,
              pix_copy_paste, pix_expires_at, confirmed_at, received_at, reservation_outcome, created_at, updated_at)
  on public.appointment_payments to authenticated;
create policy appointment_payments_select_proprio on public.appointment_payments
  for select to authenticated using (client_id = (select auth.uid()));

-- 4) Guardas de integridade.
create function public.pay_payment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.request_id is distinct from old.request_id or new.client_id is distinct from old.client_id
     or new.amount_cents is distinct from old.amount_cents or new.currency is distinct from old.currency
     or new.offering_id is distinct from old.offering_id or new.external_reference is distinct from old.external_reference
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'Valor, moeda e vinculo de uma cobranca nao podem ser alterados.' using errcode = '23503';
  end if;
  if old.provider_payment_id is not null and new.provider_payment_id is distinct from old.provider_payment_id then
    raise exception 'O identificador da cobranca no provedor nao pode ser trocado.' using errcode = '23503';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger appointment_payments_guard before update on public.appointment_payments
  for each row execute function public.pay_payment_guard();

create function public.pay_event_append_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'A trilha de eventos de pagamento e append-only.' using errcode = '23503';
end;
$$;
create trigger appointment_payment_events_append_only before update or delete on public.appointment_payment_events
  for each row execute function public.pay_event_append_only();

-- 5) Maquina de estados (espelho exato de _shared/pagamentos/estados.ts).
create function public.pay_state_clears_reservation(p_state text) returns boolean
language sql immutable set search_path = '' as $$ select p_state = 'recebido' $$;

create function public.pay_state_rank(p_state text) returns integer
language sql immutable set search_path = '' as $$
  select case p_state
    when 'criando' then 0 when 'aguardando_pagamento' then 1 when 'vencido' then 2 when 'em_processamento' then 2
    when 'confirmado' then 3 when 'recebido' then 4 when 'em_contestacao' then 5 when 'estornado' then 6
    when 'cancelado' then 7 when 'divergente' then 8 end
$$;

create function public.pay_transition_allowed(p_from text, p_to text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_from
    when 'criando' then p_to in ('aguardando_pagamento', 'em_processamento', 'confirmado', 'recebido', 'vencido', 'cancelado')
    when 'aguardando_pagamento' then p_to in ('em_processamento', 'confirmado', 'recebido', 'vencido', 'cancelado')
    when 'em_processamento' then p_to in ('confirmado', 'recebido', 'cancelado', 'vencido')
    when 'confirmado' then p_to in ('recebido', 'estornado', 'em_contestacao')
    when 'recebido' then p_to in ('estornado', 'em_contestacao')
    when 'vencido' then p_to in ('confirmado', 'recebido', 'cancelado')
    when 'cancelado' then p_to = 'aguardando_pagamento'
    when 'em_contestacao' then p_to = 'estornado'
    else false end
$$;

create function public.pay_next_state(p_current text, p_event text)
returns table (outcome text, next_state text, known boolean)
language plpgsql immutable set search_path = '' as $$
declare
  conhecidos constant text[] := array[
    'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_AWAITING_RISK_ANALYSIS', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
    'PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'PAYMENT_AUTHORIZED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
    'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_ANTICIPATED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_RESTORED',
    'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_REFUND_DENIED',
    'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE',
    'PAYMENT_AWAITING_CHARGEBACK_REVERSAL', 'PAYMENT_DUNNING_REQUESTED', 'PAYMENT_DUNNING_RECEIVED',
    'PAYMENT_BANK_SLIP_CANCELLED', 'PAYMENT_BANK_SLIP_VIEWED', 'PAYMENT_CHECKOUT_VIEWED', 'PAYMENT_SPLIT_CANCELLED',
    'PAYMENT_SPLIT_DIVERGENCE_BLOCK', 'PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED', 'PAYMENT_SPLIT_DONE'];
  alvo text;
begin
  known := p_event = any (conhecidos);
  if not known then outcome := 'sem_mudanca'; next_state := p_current; return next; return; end if;
  alvo := case p_event
    when 'PAYMENT_CREATED' then 'aguardando_pagamento'
    when 'PAYMENT_AWAITING_RISK_ANALYSIS' then 'em_processamento'
    when 'PAYMENT_APPROVED_BY_RISK_ANALYSIS' then 'em_processamento'
    when 'PAYMENT_REPROVED_BY_RISK_ANALYSIS' then 'cancelado'
    when 'PAYMENT_AUTHORIZED' then 'em_processamento'
    when 'PAYMENT_CONFIRMED' then 'confirmado'
    when 'PAYMENT_RECEIVED' then 'recebido'
    when 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' then 'cancelado'
    when 'PAYMENT_OVERDUE' then 'vencido'
    when 'PAYMENT_DELETED' then 'cancelado'
    when 'PAYMENT_RESTORED' then 'aguardando_pagamento'
    when 'PAYMENT_REFUNDED' then 'estornado'
    when 'PAYMENT_PARTIALLY_REFUNDED' then 'divergente'
    when 'PAYMENT_RECEIVED_IN_CASH_UNDONE' then 'divergente'
    when 'PAYMENT_CHARGEBACK_REQUESTED' then 'em_contestacao'
    when 'PAYMENT_CHARGEBACK_DISPUTE' then 'em_contestacao'
    when 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL' then 'em_contestacao'
    else null end;
  if alvo is null or alvo = p_current or p_current = 'divergente' then
    outcome := 'sem_mudanca'; next_state := p_current;
  elsif alvo = 'divergente' then
    outcome := 'divergencia'; next_state := 'divergente';
  elsif public.pay_transition_allowed(p_current, alvo) then
    outcome := 'aplicado'; next_state := alvo;
  elsif p_current = 'cancelado' and alvo in ('confirmado', 'recebido') then
    outcome := 'divergencia'; next_state := 'divergente';
  elsif public.pay_state_rank(alvo) <= public.pay_state_rank(p_current) then
    outcome := 'obsoleto'; next_state := p_current;
  else
    outcome := 'divergencia'; next_state := 'divergente';
  end if;
  return next;
end;
$$;

-- 6) Funcoes de servidor.
create function public.pay_payment_json(p public.appointment_payments, p_replayed boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'status', p.status, 'external_reference', p.external_reference, 'amount_cents', p.amount_cents,
    'service_title', coalesce((
      select coalesce(d.document ->> 'title', o.document ->> 'title')
      from public.op_records o
      left join public.op_records d on d.collection = 'activity_definitions' and d.id = o.document ->> 'definition_id'
      where o.collection = 'activity_offerings' and o.id = p.offering_id), p.offering_id),
    'hold_expires_at', p.hold_expires_at, 'due_date', p.due_date, 'provider_payment_id', p.provider_payment_id,
    'pix_ready', p.pix_copy_paste is not null, 'replayed', p_replayed)
$$;

create function public.pay_prepare_appointment_payment(p_user_id uuid, p_request_id uuid, p_idempotency_key uuid, p_hold_minutes integer default 30)
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

create function public.pay_register_provider_charge(p_payment_id uuid, p_provider_payment_id text, p_pix_payload text, p_pix_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pay public.appointment_payments;
begin
  if p_payment_id is null or p_provider_payment_id is null or char_length(p_provider_payment_id) not between 1 and 120 then
    raise exception 'Registro de cobranca invalido.' using errcode = '22023';
  end if;
  select * into pay from public.appointment_payments where id = p_payment_id for update;
  if not found then raise exception 'Cobranca nao encontrada.' using errcode = 'P0002'; end if;
  if pay.provider_payment_id is not null and pay.provider_payment_id <> p_provider_payment_id then
    raise exception 'A cobranca ja esta vinculada a outro identificador do provedor.' using errcode = '23503';
  end if;
  -- Se o webhook PAYMENT_CREATED chegou antes, o estado ja avancou: nao o fazemos retroceder.
  -- Chamada em duas etapas (B1): 1) so o id externo (payload nulo), logo apos criar a cobranca; 2) o Pix, quando o QR
  -- estiver disponivel (ou numa recuperacao posterior). Um payload nulo nunca apaga um Pix ja gravado.
  update public.appointment_payments
     set provider_payment_id = p_provider_payment_id,
         pix_copy_paste = coalesce(p_pix_payload, pix_copy_paste), pix_expires_at = coalesce(p_pix_expires_at, pix_expires_at),
         status = case when status = 'criando' then 'aguardando_pagamento' else status end
   where id = p_payment_id returning * into pay;
  return public.pay_payment_json(pay, false);
end;
$$;

-- So cancela uma criacao que PROVADAMENTE nao gerou cobranca externa: status 'criando' E sem id do provedor.
-- Uma cobranca com id externo nunca e cancelada aqui (so o Asaas cancela, via PAYMENT_DELETED).
create function public.pay_fail_creation(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.appointment_payments
     set status = 'cancelado', failure_reason = left(coalesce(p_reason, 'falha_criacao'), 120)
   where id = p_payment_id and status = 'criando' and provider_payment_id is null;
end;
$$;

create function public.pay_apply_webhook_event(
  p_provider_event_id text, p_event text, p_event_created text, p_provider_payment_id text, p_external_reference text,
  p_value_cents integer, p_original_value_cents integer, p_provider_status text, p_billing_type text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pay public.appointment_payments; r public.appointment_requests; slot public.appointment_slots;
  proximo record; resultado text; novo_estado text; divergiu boolean; desfecho text;
begin
  if p_provider_event_id is null or char_length(p_provider_event_id) not between 1 and 120
     or p_event is null or p_event !~ '^[A-Z_]{3,80}$' or p_provider_payment_id is null then
    raise exception 'Evento invalido.' using errcode = '22023';
  end if;
  -- Serializa entregas simultaneas do mesmo evento (o Asaas entrega "at least once").
  perform pg_advisory_xact_lock(hashtextextended('pay-event:' || p_provider_event_id, 0));
  if exists (select 1 from public.appointment_payment_events where provider_event_id = p_provider_event_id) then
    return jsonb_build_object('resultado', 'duplicado');
  end if;

  select * into pay from public.appointment_payments where provider_payment_id = p_provider_payment_id for update;
  if not found and p_external_reference is not null then
    select * into pay from public.appointment_payments
     where external_reference = p_external_reference and (provider_payment_id is null or provider_payment_id = p_provider_payment_id)
     for update;
  end if;
  if not found then
    insert into public.appointment_payment_events (provider_event_id, provider_payment_id, event, event_created, provider_status, value_cents, outcome)
    values (p_provider_event_id, p_provider_payment_id, p_event, p_event_created, p_provider_status, p_value_cents, 'sem_correspondencia');
    return jsonb_build_object('resultado', 'sem_correspondencia');
  end if;

  select * into proximo from public.pay_next_state(pay.status, p_event);
  resultado := proximo.outcome; novo_estado := proximo.next_state;
  -- Valor, moeda e meio conferidos contra o que o SERVIDOR gravou. A diferenca por juros/multa e aceita apenas se o
  -- valor original da cobranca continuar igual ao esperado.
  divergiu := (p_value_cents is distinct from pay.amount_cents and p_original_value_cents is distinct from pay.amount_cents)
              or (p_billing_type is not null and p_billing_type <> pay.billing_type)
              or (p_external_reference is not null and p_external_reference <> pay.external_reference);
  if divergiu and pay.status <> 'divergente' and proximo.known then
    resultado := 'divergencia'; novo_estado := 'divergente';
  end if;

  if resultado in ('aplicado', 'divergencia') or pay.provider_payment_id is null then
    desfecho := pay.reservation_outcome;
    if novo_estado = 'recebido' then
      select * into r from public.appointment_requests where id = pay.request_id;
      select * into slot from public.appointment_slots where id = r.appointment_slot_id;
      desfecho := case
        when pay.reservation_outcome = 'revisao' then 'revisao' -- estorno ja em andamento: nao volta a ser elegivel
        when found and r.status in ('recebida', 'em_contato', 'encerrada') and slot.held_by_request_id = r.id
             and slot.status in ('held', 'booked') and (slot.status = 'booked' or pay.hold_expires_at >= now())
          then 'elegivel' else 'pagamento_tardio' end;
    elsif novo_estado in ('estornado', 'em_contestacao', 'divergente') and pay.reservation_outcome = 'elegivel' then
      desfecho := 'revisao';
    end if;
    update public.appointment_payments
       set status = novo_estado,
           provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
           confirmed_at = case when novo_estado = 'confirmado' then coalesce(confirmed_at, now()) else confirmed_at end,
           received_at = case when novo_estado = 'recebido' then coalesce(received_at, now()) else received_at end,
           refunded_at = case when novo_estado = 'estornado' then coalesce(refunded_at, now()) else refunded_at end,
           reservation_outcome = desfecho, last_event_at = now()
     where id = pay.id;
  end if;

  -- R4: estorno em andamento NAO muda o estado financeiro (o historico fica), mas tira a elegibilidade para confirmar
  -- o atendimento: a cobranca vai para revisao manual. Nenhuma politica de reembolso e decidida aqui; REFUND_DENIED
  -- tambem nao devolve a elegibilidade sozinho (exige revisao do Owner).
  if p_event = 'PAYMENT_REFUND_IN_PROGRESS' and resultado = 'sem_mudanca'
     and pay.reservation_outcome in ('elegivel', 'pendente') then
    update public.appointment_payments set reservation_outcome = 'revisao', last_event_at = now() where id = pay.id;
    resultado := 'aplicado';
  end if;

  insert into public.appointment_payment_events (provider_event_id, payment_id, provider_payment_id, event, event_created,
    provider_status, value_cents, outcome, from_status, to_status)
  values (p_provider_event_id, pay.id, p_provider_payment_id, p_event, p_event_created, p_provider_status, p_value_cents,
    resultado, pay.status, novo_estado);
  return jsonb_build_object('resultado', resultado);
end;
$$;

-- Reservas sem pagamento valido apos o prazo (somente leitura; liberar o horario e a PAY-02, atras de flag).
create function public.pay_list_expired_holds(p_now timestamptz default now())
returns table (payment_id uuid, request_id uuid, status text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.request_id, p.status from public.appointment_payments p
  where p.hold_expires_at < p_now and p.status in ('criando', 'aguardando_pagamento', 'em_processamento', 'vencido')
$$;

-- Porta para a PAY-02: so um pagamento recebido com a reserva valida autoriza confirmar o atendimento.
create function public.pay_payment_allows_confirmation(p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.appointment_payments p
    where p.request_id = p_request_id and public.pay_state_clears_reservation(p.status) and p.reservation_outcome = 'elegivel')
$$;

-- 7) Privilegios: nada de funcao financeira para anon/authenticated; somente service_role.
revoke all on function public.pay_payment_guard() from public, anon, authenticated;
revoke all on function public.pay_event_append_only() from public, anon, authenticated;
revoke all on function public.pay_state_clears_reservation(text) from public, anon, authenticated;
revoke all on function public.pay_state_rank(text) from public, anon, authenticated;
revoke all on function public.pay_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function public.pay_next_state(text, text) from public, anon, authenticated;
revoke all on function public.pay_payment_json(public.appointment_payments, boolean) from public, anon, authenticated;
revoke all on function public.pay_prepare_appointment_payment(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.pay_register_provider_charge(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.pay_fail_creation(uuid, text) from public, anon, authenticated;
revoke all on function public.pay_apply_webhook_event(text, text, text, text, text, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.pay_list_expired_holds(timestamptz) from public, anon, authenticated;
revoke all on function public.pay_payment_allows_confirmation(uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on public.appointment_payments to service_role';
    execute 'grant select, insert on public.appointment_payment_events to service_role';
    execute 'grant select on public.appointment_service_prices to service_role';
    execute 'grant execute on function public.pay_next_state(text, text) to service_role';
    execute 'grant execute on function public.pay_prepare_appointment_payment(uuid, uuid, uuid, integer) to service_role';
    execute 'grant execute on function public.pay_register_provider_charge(uuid, text, text, timestamptz) to service_role';
    execute 'grant execute on function public.pay_fail_creation(uuid, text) to service_role';
    execute 'grant execute on function public.pay_apply_webhook_event(text, text, text, text, text, integer, integer, text, text) to service_role';
    execute 'grant execute on function public.pay_list_expired_holds(timestamptz) to service_role';
    execute 'grant execute on function public.pay_payment_allows_confirmation(uuid) to service_role';
  end if;
end;
$$;

commit;
