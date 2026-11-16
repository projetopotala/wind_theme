-- Cursos: recebimento manual (o Instituto recebeu por fora do portal e o Owner registra no painel).
--
-- Problema: um pedido "aguardando_pagamento" so avanca por confirm_course_enrollment_payment, reservada ao servidor
-- (futuro webhook do Asaas). O Owner nao tinha como registrar um Pix/transferencia/dinheiro realmente recebido.
--
-- O que esta migration faz (so aditiva; nao redefine nenhuma funcao interna da 202611160007 nem a de pagamento do servidor):
--   * course_enrollment_payments: um registro por recebimento (origem "manual", forma, valor congelado, data, referencia,
--     quem registrou). Nunca e apagado; correcao muda o estado (anulado/estornado) e guarda quem, quando e por que.
--   * course_enrollment_payment_events: trilha append-only (estado anterior e posterior do recebimento e do pedido).
--   * admin_register_manual_course_payment: Owner ativo (is_portal_admin). Confere o valor contra o valor CONGELADO no
--     pedido (o navegador so repete o que viu; divergencia e recusada), exige o pedido em "aguardando_pagamento" e a versao
--     (updated_at) que o Owner viu, e faz tudo em UMA transacao: recebimento + pedido -> pagamento_confirmado ->
--     matriculada + matricula operacional (course_enrollment_materialize, a mesma do fluxo gratuito e do servidor).
--     Qualquer falha desfaz tudo (nunca "pago sem matricula"). Repetir a mesma chave devolve o mesmo resultado; outra chave
--     para o mesmo pedido e recusada (indice unico parcial + trava da linha do pedido).
--   * admin_reverse_manual_course_payment: correcao auditavel. "registro_incorreto" (nenhum dinheiro entrou): cancela a
--     matricula operacional e devolve o pedido a "aguardando_pagamento". "estorno_realizado" (o dinheiro foi devolvido de
--     fato): cancela a inscricao (se ainda ativa) e marca o recebimento como estornado. Cancelar a inscricao pela fila NAO
--     implica devolucao: o recebimento segue "registrado" ate o Owner registrar o estorno.
--   * admin_list_course_enrollment_requests: mesma lista, com o recebimento mais recente de cada pedido (campo "payment").
-- Autorizacao: course_payment_is_owner() (role owner ativo em public.users).
-- Estados do pedido e eventos reutilizam os da 202611160007; a origem do evento passa a aceitar "manual".
-- Compatibilidade Asaas (PR #79): nada aqui redefine course_enrollment_transition nem confirm_course_enrollment_payment.
--   Pedido pago manualmente fica "matriculada", entao o webhook (que devolve "replayed" para matriculada) nao duplica nada
--   e nenhuma cobranca nova nasce (a criacao exige "aguardando_pagamento").
--   Mao dupla: se ja existe cobranca online aberta/paga (creating, active, paid, manual_review, disputed) o recebimento
--   manual e recusado (PT409) ate o Owner resolver a cobranca; a checagem so roda se a tabela da #79 existir.
-- Reversao: supabase/rollbacks/202611160008_rollback_cursos_recebimento_manual.sql (preserva a auditoria financeira).

begin;

alter table public.course_enrollment_request_events
  drop constraint if exists course_enrollment_request_events_actor_kind_check;
alter table public.course_enrollment_request_events
  add constraint course_enrollment_request_events_actor_kind_check
  check (actor_kind in ('aluno', 'administracao', 'servidor', 'manual'));

create table if not exists public.course_enrollment_payments (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  request_id uuid not null references public.course_enrollment_requests (id) on delete restrict,
  source text not null default 'manual' check (source in ('manual')),
  method text not null check (method in ('pix', 'transferencia', 'dinheiro', 'outro')),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 999999999),
  received_on date not null,
  reference text check (reference is null or char_length(reference) <= 200),
  status text not null default 'registrado' check (status in ('registrado', 'anulado', 'estornado')),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  reversed_by uuid references auth.users (id) on delete set null,
  reversed_at timestamptz,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) between 5 and 300),
  check ((status = 'registrado') = (reversed_at is null))
);
create unique index if not exists course_enrollment_payments_um_registrado
  on public.course_enrollment_payments (request_id) where status = 'registrado';
create index if not exists course_enrollment_payments_pedido on public.course_enrollment_payments (request_id, recorded_at desc);

create table if not exists public.course_enrollment_payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.course_enrollment_payments (id) on delete restrict,
  actor_id uuid,
  action text not null check (action in ('registrado', 'anulado', 'estornado')),
  from_status text,
  to_status text not null,
  request_from_status text,
  request_to_status text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.course_enrollment_payments enable row level security;
alter table public.course_enrollment_payment_events enable row level security;
revoke all on table public.course_enrollment_payments from public, anon, authenticated;
revoke all on table public.course_enrollment_payment_events from public, anon, authenticated;

-- Recebimento nunca e apagado nem reescrito: so muda de "registrado" para "anulado"/"estornado".
create or replace function public.course_payment_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Recebimentos não podem ser apagados.' using errcode = '42501';
  end if;
  if (new.id, new.idempotency_key, new.request_id, new.source, new.method, new.amount_cents, new.received_on, new.reference, new.recorded_at)
     is distinct from
     (old.id, old.idempotency_key, old.request_id, old.source, old.method, old.amount_cents, old.received_on, old.reference, old.recorded_at) then
    raise exception 'Os dados do recebimento não podem ser alterados.' using errcode = '42501';
  end if;
  if old.status <> 'registrado' and (new.status is distinct from old.status or new.reversal_reason is distinct from old.reversal_reason
      or new.reversed_at is distinct from old.reversed_at) then
    raise exception 'Este recebimento já foi corrigido.' using errcode = 'PT409';
  end if;
  return new;
end;
$$;
revoke all on function public.course_payment_guard() from public, anon, authenticated;
drop trigger if exists course_payment_guard on public.course_enrollment_payments;
create trigger course_payment_guard before update or delete on public.course_enrollment_payments
  for each row execute function public.course_payment_guard();

create or replace function public.course_payment_event_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A trilha de recebimentos não pode ser alterada.' using errcode = '42501';
end;
$$;
revoke all on function public.course_payment_event_guard() from public, anon, authenticated;
drop trigger if exists course_payment_event_guard on public.course_enrollment_payment_events;
create trigger course_payment_event_guard before update or delete on public.course_enrollment_payment_events
  for each row execute function public.course_payment_event_guard();

-- Recebimento manual e do Owner ativo (nao de qualquer administrador, escritor, profissional ou aluno).
create or replace function public.course_payment_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.users where id = (select auth.uid()) and role = 'owner' and active = true);
$$;
revoke all on function public.course_payment_is_owner() from public, anon, authenticated;

create or replace function public.admin_register_manual_course_payment(
  p_idempotency_key uuid, p_request_id uuid, p_expected_updated_at timestamptz,
  p_amount_cents integer, p_method text, p_received_on date, p_reference text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.course_enrollment_requests%rowtype;
  pay public.course_enrollment_payments%rowtype;
  v_ref text := nullif(btrim(p_reference), '');
  v_hoje date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_ator uuid := (select auth.uid());
  v_aberta boolean := false;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner registra recebimentos.' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_request_id is null or p_expected_updated_at is null or p_amount_cents is null
     or p_received_on is null or coalesce(p_method, '') not in ('pix', 'transferencia', 'dinheiro', 'outro') then
    raise exception 'Dados do recebimento incompletos. Recarregue a inscrição.' using errcode = '22023';
  end if;
  if v_ref is not null and char_length(v_ref) > 200 then
    raise exception 'A referência é longa demais (máximo 200 caracteres).' using errcode = '22023';
  end if;
  if p_method = 'outro' and v_ref is null then
    raise exception 'Informe a referência quando a forma for "outro".' using errcode = '22023';
  end if;
  if p_received_on > v_hoje then
    raise exception 'A data do recebimento não pode ser futura.' using errcode = '22023';
  end if;

  select * into r from public.course_enrollment_requests where id = p_request_id for update;
  if not found then
    raise exception 'Inscrição inexistente.' using errcode = 'P0002';
  end if;

  select * into pay from public.course_enrollment_payments where idempotency_key = p_idempotency_key;
  if found then
    if pay.request_id <> p_request_id then
      raise exception 'Esta chave já foi usada em outra inscrição.' using errcode = 'PT409';
    end if;
    return jsonb_build_object('id', r.id, 'status', r.status, 'payment_id', pay.id, 'replayed', true);
  end if;

  if r.status <> 'aguardando_pagamento' then
    raise exception 'Esta inscrição não está aguardando pagamento (situação: %).', r.status using errcode = 'PT409';
  end if;
  if r.updated_at is distinct from p_expected_updated_at then
    raise exception 'A inscrição mudou. Recarregue a lista.' using errcode = 'PT409';
  end if;
  if r.price_cents <= 0 then
    raise exception 'Inscrição gratuita não tem recebimento.' using errcode = '22023';
  end if;
  -- Cobranca online (Asaas, PR #79) aberta ou paga para este pedido: nao registrar recebimento manual por cima
  -- (evita pagamento em duplicidade). A tabela so existe depois da migration da integracao; ate la nada a checar.
  if to_regclass('public.course_payment_checkouts') is not null then
    execute 'select exists (select 1 from public.course_payment_checkouts where request_id = $1 and status in (''creating'', ''active'', ''paid'', ''manual_review'', ''disputed''))'
      into v_aberta using p_request_id;
    if v_aberta then
      raise exception 'Há uma cobrança online aberta ou paga para esta inscrição. Resolva-a antes de registrar um recebimento manual.' using errcode = 'PT409';
    end if;
  end if;
  if p_amount_cents is distinct from r.price_cents then
    raise exception 'O valor informado difere do valor da inscrição.' using errcode = '22023';
  end if;
  if p_received_on < (r.created_at at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do recebimento é anterior ao pedido de inscrição.' using errcode = '22023';
  end if;

  insert into public.course_enrollment_payments (idempotency_key, request_id, source, method, amount_cents, received_on, reference, recorded_by)
  values (p_idempotency_key, p_request_id, 'manual', p_method, r.price_cents, p_received_on, v_ref, v_ator)
  returning * into pay;
  insert into public.course_enrollment_payment_events (payment_id, actor_id, action, from_status, to_status, request_from_status, request_to_status)
  values (pay.id, v_ator, 'registrado', null, 'registrado', 'aguardando_pagamento', 'matriculada');

  update public.course_enrollment_requests set status = 'pagamento_confirmado', updated_at = clock_timestamp() where id = p_request_id;
  insert into public.course_enrollment_request_events (request_id, actor_id, actor_kind, from_status, to_status)
  values (p_request_id, v_ator, 'manual', 'aguardando_pagamento', 'pagamento_confirmado');
  update public.course_enrollment_requests set status = 'matriculada', updated_at = clock_timestamp() where id = p_request_id;
  insert into public.course_enrollment_request_events (request_id, actor_id, actor_kind, from_status, to_status)
  values (p_request_id, v_ator, 'manual', 'pagamento_confirmado', 'matriculada');
  update public.course_enrollment_requests set op_enrollment_id = public.course_enrollment_materialize(p_request_id, 'manual')
   where id = p_request_id returning * into r;

  return jsonb_build_object('id', r.id, 'status', r.status, 'updated_at', r.updated_at, 'payment_id', pay.id,
    'op_enrollment_id', r.op_enrollment_id);
end;
$$;

create or replace function public.admin_reverse_manual_course_payment(p_payment_id uuid, p_outcome text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pay public.course_enrollment_payments%rowtype;
  r public.course_enrollment_requests%rowtype;
  v_motivo text := nullif(btrim(p_reason), '');
  v_ator uuid := (select auth.uid());
  v_novo text;
  v_de text;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner corrige recebimentos.' using errcode = '42501';
  end if;
  if p_payment_id is null or coalesce(p_outcome, '') not in ('registro_incorreto', 'estorno_realizado')
     or v_motivo is null or char_length(v_motivo) not between 5 and 300 then
    raise exception 'Informe o tipo de correção e o motivo (5 a 300 caracteres).' using errcode = '22023';
  end if;
  v_novo := case p_outcome when 'registro_incorreto' then 'anulado' else 'estornado' end;

  select request_id into r.id from public.course_enrollment_payments where id = p_payment_id;
  if r.id is null then
    raise exception 'Recebimento inexistente.' using errcode = 'P0002';
  end if;
  select * into r from public.course_enrollment_requests where id = r.id for update;
  select * into pay from public.course_enrollment_payments where id = p_payment_id for update;
  if pay.status = v_novo then
    return jsonb_build_object('id', r.id, 'status', r.status, 'payment_id', pay.id, 'payment_status', pay.status, 'replayed', true);
  end if;
  if pay.status <> 'registrado' then
    raise exception 'Este recebimento já foi corrigido (%).', pay.status using errcode = 'PT409';
  end if;
  v_de := r.status;

  if p_outcome = 'registro_incorreto' then
    if r.status <> 'matriculada' then
      raise exception 'Só dá para anular o registro enquanto a inscrição está matriculada (situação: %).', r.status using errcode = '22023';
    end if;
    update public.course_enrollment_requests set status = 'aguardando_pagamento', updated_at = clock_timestamp() where id = r.id;
    insert into public.course_enrollment_request_events (request_id, actor_id, actor_kind, from_status, to_status)
    values (r.id, v_ator, 'manual', 'matriculada', 'aguardando_pagamento');
    if r.op_enrollment_id is not null then
      perform public.course_enrollment_dematerialize(r.op_enrollment_id);
    end if;
  else
    if r.status = 'matriculada' then
      perform public.course_enrollment_transition(r.id, null, 'cancelada', 'administracao');
    elsif r.status <> 'cancelada' then
      raise exception 'Estorno só se aplica a inscrição matriculada ou cancelada (situação: %).', r.status using errcode = '22023';
    end if;
  end if;

  update public.course_enrollment_payments set status = v_novo, reversed_by = v_ator, reversed_at = clock_timestamp(),
         reversal_reason = v_motivo where id = pay.id returning * into pay;
  select * into r from public.course_enrollment_requests where id = r.id;
  insert into public.course_enrollment_payment_events (payment_id, actor_id, action, from_status, to_status, request_from_status, request_to_status, note)
  values (pay.id, v_ator, v_novo, 'registrado', v_novo, v_de, r.status, v_motivo);
  return jsonb_build_object('id', r.id, 'status', r.status, 'updated_at', r.updated_at, 'payment_id', pay.id, 'payment_status', pay.status);
end;
$$;

-- Mesma lista da 202611160007, mais o recebimento mais recente de cada pedido (campo "payment").
create or replace function public.admin_list_course_enrollment_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_portal_admin()) then
    raise exception 'Somente a administração vê as inscrições.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'price_cents', r.price_cents, 'created_at', r.created_at, 'updated_at', r.updated_at,
      'offering_id', r.offering_id,
      'course_title', coalesce(nullif(btrim(d.document ->> 'title'), ''), o.document ->> 'title'),
      'offering_title', o.document ->> 'title',
      'student_name', left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)), 120),
      'student_email', lower(u.email),
      'capacity', case when (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$' then (o.document ->> 'capacity')::integer end,
      'seats_taken', public.course_seats_taken(r.offering_id),
      'payment', (
        select jsonb_build_object('id', p.id, 'source', p.source, 'method', p.method, 'amount_cents', p.amount_cents,
          'received_on', p.received_on, 'reference', p.reference, 'status', p.status, 'recorded_at', p.recorded_at,
          'reversal_reason', p.reversal_reason)
        from public.course_enrollment_payments p where p.request_id = r.id order by p.recorded_at desc, p.id desc limit 1)
    ) order by r.created_at desc)
    from public.course_enrollment_requests r
    join auth.users u on u.id = r.user_id
    left join public.op_records o on o.collection = 'activity_offerings' and o.id = r.offering_id
    left join public.op_records d on d.collection = 'activity_definitions' and d.id = r.course_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_register_manual_course_payment(uuid, uuid, timestamptz, integer, text, date, text) from public, anon, authenticated;
grant execute on function public.admin_register_manual_course_payment(uuid, uuid, timestamptz, integer, text, date, text) to authenticated;
revoke all on function public.admin_reverse_manual_course_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_reverse_manual_course_payment(uuid, text, text) to authenticated;
revoke all on function public.admin_list_course_enrollment_requests() from public, anon, authenticated;
grant execute on function public.admin_list_course_enrollment_requests() to authenticated;

commit;
