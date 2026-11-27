-- PAY-11: operacao Pix por oferta, opt-in e Owner-only.
-- A tabela nasce vazia; charges_enabled continua sendo a parada global.

create table public.pay_offering_policies (
  offering_id text primary key references public.appointment_service_prices(offering_id) on delete restrict,
  enabled boolean not null default false,
  require_prepayment boolean not null default true,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.pay_offering_policies enable row level security;
revoke all on table public.pay_offering_policies from public, anon, authenticated;

create function public.pay_normal_offering_authorized(p_user_id uuid, p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and p_request_id is not null and exists (
    select 1 from public.appointment_requests r
    join public.appointment_slots s on s.id = r.appointment_slot_id
    join public.op_records o on o.collection = 'activity_offerings' and o.id = r.offering_id
      and coalesce((o.document ->> 'active')::boolean, true)
    join public.appointment_service_prices sp on sp.offering_id = r.offering_id and sp.active
    join public.pay_offering_policies po on po.offering_id = r.offering_id and po.enabled
    where r.id = p_request_id and r.requester_user_id = p_user_id
      and r.status in ('recebida','em_contato') and r.reservation_schedule_id is null
      and s.status = 'held' and s.held_by_request_id = r.id and s.starts_at > now()
  )
$$;

-- Cancelar uma consulta com cobranca ainda acompanhada exige primeiro o
-- procedimento financeiro. A Central recebe PT409 e preserva agenda/historico.
create function public.pay_guard_cancelled_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_request_id uuid;
begin
  if old.collection <> 'schedule_items' or new.collection <> 'schedule_items'
     or coalesce(old.document ->> 'status','') = 'cancelled'
     or coalesce(new.document ->> 'status','') <> 'cancelled' then return new; end if;
  begin v_request_id := nullif(new.document ->> 'appointment_request_id','')::uuid;
  exception when invalid_text_representation then v_request_id := null; end;
  if v_request_id is not null and exists (
    select 1 from public.appointment_payments p where p.request_id=v_request_id
      and p.status not in ('cancelado','estornado')
  ) then
    raise exception 'Atendimento possui cobranca ativa. Revise o pagamento antes de cancelar.' using errcode='PT409';
  end if;
  return new;
end;
$$;
create trigger pay_guard_cancelled_appointment before update on public.op_records
for each row when (old.collection='schedule_items' and new.collection='schedule_items')
execute function public.pay_guard_cancelled_appointment();

create or replace function public.pay_charge_allowed(p_user_id uuid, p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.pay_charges_enabled() and (
    public.pay_pilot_authorized(p_user_id, p_request_id)
    or public.pay_normal_offering_authorized(p_user_id, p_request_id)
  )
$$;

-- Leitura minima para a propria conta. Informa valor e modo; nunca abre cobranca.
create function public.pay_my_appointment_payment_options() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id', r.id, 'amount_cents', sp.amount_cents, 'currency', sp.currency,
    'mode', case when public.pay_pilot_authorized((select auth.uid()), r.id) then 'pilot'
                 when coalesce(po.enabled, false) then 'normal' else 'none' end,
    'charge_allowed', public.pay_charge_allowed((select auth.uid()), r.id),
    'confirmed', r.reservation_schedule_id is not null,
    'eligible', r.status in ('recebida','em_contato') and r.reservation_schedule_id is null
      and s.status = 'held' and s.held_by_request_id = r.id and s.starts_at > now(),
    'reason', case
      when r.reservation_schedule_id is not null then 'Atendimento ja confirmado; nenhuma cobranca retroativa sera criada.'
      when r.status not in ('recebida','em_contato') then 'Pedido fora da etapa de pagamento.'
      when s.id is null then 'Pedido sem horario reservado.'
      when s.status <> 'held' or s.held_by_request_id is distinct from r.id then 'Horario nao esta reservado para este pedido.'
      when s.starts_at <= now() then 'Horario reservado ja venceu.'
      when sp.offering_id is null then 'Oferta sem preco ativo.'
      else null end
  ) order by r.created_at desc), '[]'::jsonb)
  from public.appointment_requests r
  left join public.appointment_slots s on s.id = r.appointment_slot_id
  left join public.appointment_service_prices sp on sp.offering_id = r.offering_id and sp.active
  left join public.pay_offering_policies po on po.offering_id = r.offering_id
  where r.requester_user_id = (select auth.uid()) and sp.offering_id is not null
$$;

create function public.admin_set_pay_offering_policy(p_offering_id text, p_enabled boolean, p_require_prepayment boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_before public.pay_offering_policies; v_after public.pay_offering_policies;
  v_offer public.op_records; v_audit_id text := gen_random_uuid()::text; v_actor_name text;
begin
  if not public.course_payment_is_owner() then raise exception 'Somente o Owner administra pagamentos por oferta.' using errcode='42501'; end if;
  if p_offering_id is null or p_enabled is null or p_require_prepayment is null then raise exception 'Politica de pagamento invalida.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pay-offering:' || btrim(p_offering_id), 0));
  select * into v_offer from public.op_records where collection='activity_offerings' and id=btrim(p_offering_id);
  if not found then raise exception 'Oferta nao encontrada.' using errcode='P0002'; end if;
  if p_enabled and not coalesce((v_offer.document->>'active')::boolean,true) then
    raise exception 'Oferta inativa nao pode habilitar pagamentos.' using errcode='22023';
  end if;
  if public.pay_admin_offering_is_test(v_offer.document, (select document from public.op_records where collection='profiles' and id=v_offer.document->>'professional_id')) then
    raise exception 'Oferta de teste ou demonstracao nao pode receber pagamentos.' using errcode='22023';
  end if;
  if p_enabled and not exists(select 1 from public.appointment_service_prices where offering_id=v_offer.id and active) then
    raise exception 'Ative um preco antes de habilitar pagamentos.' using errcode='22023';
  end if;
  select * into v_before from public.pay_offering_policies where offering_id=v_offer.id for update;
  insert into public.pay_offering_policies(offering_id,enabled,require_prepayment,updated_by)
  values(v_offer.id,p_enabled,p_require_prepayment,v_actor)
  on conflict(offering_id) do update set enabled=excluded.enabled,require_prepayment=excluded.require_prepayment,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_after;
  if v_before is null or (v_before.enabled,v_before.require_prepayment) is distinct from (v_after.enabled,v_after.require_prepayment) then
    select coalesce(nullif(btrim(name),''),'Owner') into v_actor_name from public.users where id=v_actor;
    insert into public.op_records(collection,id,document,updated_at) values('audit_events',v_audit_id,jsonb_build_object(
      'id',v_audit_id,'actor',coalesce(v_actor_name,'Owner'),'actor_id',v_actor,'at',to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'action',case when p_enabled then 'pay_offering.enabled' else 'pay_offering.disabled' end,'reason','Central Financeira',
      'changes',jsonb_build_array(jsonb_build_object('table','pay_offering_policies','id',v_offer.id,'before',case when v_before is null then null else to_jsonb(v_before) - 'updated_by' end,'after',to_jsonb(v_after) - 'updated_by'))),clock_timestamp());
  end if;
  return jsonb_build_object('offering_id',v_after.offering_id,'enabled',v_after.enabled,'require_prepayment',v_after.require_prepayment);
end;
$$;

-- Acrescenta a politica a listagem PAY-10 sem expor a tabela ao navegador.
create or replace function public.admin_list_appointment_service_prices() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.course_payment_is_owner() then raise exception 'Somente o Owner administra precos de atendimentos.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('offering_id',o.id,'title',coalesce(nullif(btrim(o.document->>'title'),''),o.id),
    'published',coalesce((o.document->>'published')::boolean,false),'professional_name',coalesce(nullif(btrim(p.document->>'display_name'),''),'Profissional nao identificado'),
    'professional_eligible',p.id is not null and coalesce((p.document->>'active')::boolean,true) and coalesce((p.document->>'published')::boolean,false) and coalesce(p.document->'roles','[]'::jsonb)?'professional',
    'test_or_demo',public.pay_admin_offering_is_test(o.document,p.document),'amount_cents',sp.amount_cents,'currency',coalesce(sp.currency,'BRL'),
    'price_active',coalesce(sp.active,false),'payments_enabled',coalesce(po.enabled,false),'require_prepayment',coalesce(po.require_prepayment,true),'updated_at',sp.updated_at)
    order by lower(coalesce(nullif(btrim(o.document->>'title'),''),o.id))),'[]'::jsonb) into v_result
  from public.op_records o left join public.op_records p on p.collection='profiles' and p.id=nullif(btrim(o.document->>'professional_id'),'')
  left join public.appointment_service_prices sp on sp.offering_id=o.id left join public.pay_offering_policies po on po.offering_id=o.id
  where o.collection='activity_offerings' and coalesce((o.document->>'active')::boolean,true);
  return v_result;
end;
$$;

revoke all on function public.pay_normal_offering_authorized(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pay_guard_cancelled_appointment() from public,anon,authenticated;
revoke all on function public.pay_charge_allowed(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pay_my_appointment_payment_options() from public,anon;
revoke all on function public.admin_set_pay_offering_policy(text,boolean,boolean) from public,anon;
grant execute on function public.pay_normal_offering_authorized(uuid,uuid) to service_role;
grant execute on function public.pay_charge_allowed(uuid,uuid) to service_role;
grant execute on function public.pay_my_appointment_payment_options() to authenticated;
grant execute on function public.admin_set_pay_offering_policy(text,boolean,boolean) to authenticated;
