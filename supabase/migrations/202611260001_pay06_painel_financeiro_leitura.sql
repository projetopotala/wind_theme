-- PAY-06: leitura administrativa dos pagamentos de atendimento (Owner ativo). SOMENTE LEITURA.
--
-- Tres funcoes que apenas LEEM; nenhuma escreve, gera, cancela ou altera cobranca, e nenhuma permissao e criada ou ampliada.
--   * admin_pay_overview()                          situacao geral (travas, contagem por situacao, pendencias de revisao)
--   * admin_list_appointment_payments(status,limit) lista de cobrancas (sem CPF, sem Pix, sem id do provedor)
--   * admin_list_appointment_payment_events(id)     historico de eventos e pendencias de UMA cobranca
-- Autorizacao: course_payment_is_owner() (role owner ativo em public.users), a mesma do recebimento manual de cursos.
-- anon e authenticated nao enxergam as tabelas; so executam estas funcoes, e elas recusam quem nao e Owner ativo (42501).
-- Reversivel por supabase/rollbacks/202611260001_rollback_pay06_painel_financeiro_leitura.sql. Nao toca em dados.

create function public.admin_pay_overview()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner acompanha os pagamentos.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'charges_enabled', public.pay_charges_enabled(),
    'total', (select count(*) from public.appointment_payments),
    'por_situacao', coalesce((select jsonb_object_agg(s.status, s.n) from (
        select status, count(*) as n from public.appointment_payments group by status) s), '{}'::jsonb),
    'revisoes_abertas', (select count(*) from public.pay_reconciliation_log where resolved_at is null),
    'ultimo_evento_em', (select max(received_at) from public.appointment_payment_events)
  ) into r;
  return r;
end;
$$;

create function public.admin_list_appointment_payments(p_status text default null, p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100); r jsonb;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner acompanha os pagamentos.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('criando', 'aguardando_pagamento', 'em_processamento', 'confirmado', 'recebido',
       'vencido', 'cancelado', 'estornado', 'em_contestacao', 'divergente') then
    raise exception 'Situacao desconhecida.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into r from (
    select p.id, p.status, p.amount_cents, coalesce(nullif(btrim(q.service), ''), 'Atendimento') as servico,
           p.created_at, p.updated_at, p.due_date, p.confirmed_at, p.received_at, p.refunded_at,
           p.reservation_outcome, p.failure_reason, p.last_event_at,
           (select count(*) from public.appointment_payment_events e where e.payment_id = p.id) as eventos,
           (select count(*) from public.appointment_payment_events e where e.payment_id = p.id
              and e.outcome in ('divergencia', 'sem_correspondencia')) as eventos_com_falha,
           (select count(*) from public.pay_reconciliation_log l where l.payment_id = p.id and l.resolved_at is null) as revisoes_abertas
    from public.appointment_payments p
    left join public.appointment_requests q on q.id = p.request_id
    where p_status is null or p.status = p_status
    order by p.created_at desc
    limit v_limit
  ) x;
  return r;
end;
$$;

create function public.admin_list_appointment_payment_events(p_payment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.course_payment_is_owner() then
    raise exception 'Somente o Owner acompanha os pagamentos.' using errcode = '42501';
  end if;
  if p_payment_id is null then
    raise exception 'Informe a cobranca.' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'eventos', coalesce((select jsonb_agg(jsonb_build_object(
        'evento', e.event, 'resultado', e.outcome, 'de', e.from_status, 'para', e.to_status,
        'valor_cents', e.value_cents, 'recebido_em', e.received_at) order by e.received_at desc, e.id desc)
      from (select * from public.appointment_payment_events where payment_id = p_payment_id
            order by received_at desc, id desc limit 100) e), '[]'::jsonb),
    'revisoes', coalesce((select jsonb_agg(jsonb_build_object(
        'tipo', l.kind, 'aberta_em', l.created_at, 'resolvida_em', l.resolved_at) order by l.created_at desc)
      from (select * from public.pay_reconciliation_log where payment_id = p_payment_id
            order by created_at desc limit 50) l), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

revoke all on function public.admin_pay_overview() from public, anon, authenticated;
revoke all on function public.admin_list_appointment_payments(text, integer) from public, anon, authenticated;
revoke all on function public.admin_list_appointment_payment_events(uuid) from public, anon, authenticated;
grant execute on function public.admin_pay_overview() to authenticated;
grant execute on function public.admin_list_appointment_payments(text, integer) to authenticated;
grant execute on function public.admin_list_appointment_payment_events(uuid) to authenticated;
