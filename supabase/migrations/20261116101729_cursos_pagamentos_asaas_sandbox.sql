-- PR C: pagamentos de cursos pelo Checkout hospedado do Asaas (Sandbox).
-- A chave Asaas e o token do webhook existem somente nas Edge Functions.
-- O navegador nunca escolhe o valor e nunca confirma pagamento.
begin;

create table public.course_payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.course_enrollment_requests(id) on delete restrict,
  idempotency_key uuid not null,
  provider text not null default 'asaas' check (provider = 'asaas'),
  environment text not null default 'sandbox' check (environment = 'sandbox'),
  external_reference text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  provider_checkout_id text unique,
  checkout_url text,
  status text not null default 'creating'
    check (status in ('creating','active','paid','canceled','expired','refunded','disputed','manual_review','failed')),
  provider_status text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  paid_at timestamptz,
  reversed_at timestamptz,
  last_error text,
  unique (request_id, idempotency_key)
);
create unique index course_payment_checkouts_one_open
  on public.course_payment_checkouts(request_id)
  where status in ('creating','active','paid','manual_review','disputed');
create index course_payment_checkouts_request on public.course_payment_checkouts(request_id, created_at desc);

create table public.course_payment_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null default 'asaas' check (provider = 'asaas'),
  environment text not null check (environment = 'sandbox'),
  provider_event_id text not null,
  event_type text not null,
  provider_checkout_id text,
  external_reference text,
  payload jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  processing_status text not null default 'received'
    check (processing_status in ('received','processed','ignored','manual_review','failed')),
  processing_error text,
  unique (provider, environment, provider_event_id)
);
create index course_payment_webhook_events_checkout on public.course_payment_webhook_events(provider_checkout_id, received_at desc);

alter table public.course_payment_checkouts enable row level security;
alter table public.course_payment_webhook_events enable row level security;
revoke all on table public.course_payment_checkouts, public.course_payment_webhook_events from public, anon, authenticated;
grant select, insert, update on table public.course_payment_checkouts, public.course_payment_webhook_events to service_role;
grant usage, select on sequence public.course_payment_webhook_events_id_seq to service_role;

-- Reserva um unico Checkout para o aluno autenticado e devolve somente dados
-- autoritativos congelados no pedido. Repetir a mesma chave e idempotente.
create or replace function public.prepare_course_payment_checkout(p_request_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.course_enrollment_requests%rowtype;
  c public.course_payment_checkouts%rowtype;
  v_title text;
  v_created boolean := false;
  v_attempt uuid;
begin
  if v_uid is null or p_request_id is null or p_idempotency_key is null then
    raise exception 'Entre na sua conta para pagar.' using errcode = '42501';
  end if;
  select * into r from public.course_enrollment_requests where id = p_request_id for update;
  if not found or r.user_id <> v_uid then
    raise exception 'Inscrição inexistente.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null and u.deleted_at is null) then
    raise exception 'Confirme seu e-mail antes de pagar.' using errcode = '42501';
  end if;
  if r.status <> 'aguardando_pagamento' or r.price_cents <= 0 then
    raise exception 'Esta inscrição não está aguardando pagamento.' using errcode = '22023';
  end if;
  select * into c from public.course_payment_checkouts
   where request_id = r.id and idempotency_key = p_idempotency_key;
  if not found then
    select * into c from public.course_payment_checkouts
     where request_id = r.id and status in ('creating','active','paid','manual_review','disputed')
     order by created_at desc limit 1;
  end if;
  if not found then
    v_attempt := gen_random_uuid();
    insert into public.course_payment_checkouts(request_id,idempotency_key,external_reference,amount_cents)
    values (r.id,p_idempotency_key,'course:' || r.id::text || ':' || v_attempt::text,r.price_cents) returning * into c;
    v_created := true;
  end if;
  select left(coalesce(nullif(btrim(d.document->>'title'),''),nullif(btrim(o.document->>'title'),''),'Curso'),160)
    into v_title from public.op_records o
    left join public.op_records d on d.collection='activity_definitions' and d.id=r.course_id
   where o.collection='activity_offerings' and o.id=r.offering_id;
  return jsonb_build_object('id',c.id,'status',c.status,'provider_checkout_id',c.provider_checkout_id,
    'checkout_url',c.checkout_url,'external_reference',c.external_reference,'amount_cents',c.amount_cents,
    'course_title',coalesce(v_title,'Curso'),'replayed',not v_created);
end;
$$;

create or replace function public.register_course_payment_checkout(
  p_checkout_id uuid, p_provider_checkout_id text, p_checkout_url text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare c public.course_payment_checkouts%rowtype;
begin
  if coalesce(btrim(p_provider_checkout_id),'') = '' or p_checkout_url !~ '^https://asaas\.com/checkoutSession/show\?id=' then
    raise exception 'Resposta de Checkout inválida.' using errcode = '22023';
  end if;
  update public.course_payment_checkouts set provider_checkout_id=p_provider_checkout_id,
    checkout_url=p_checkout_url,status='active',provider_status='ACTIVE',updated_at=clock_timestamp(),last_error=null
   where id=p_checkout_id and status='creating' returning * into c;
  if not found then
    select * into c from public.course_payment_checkouts where id=p_checkout_id and provider_checkout_id=p_provider_checkout_id;
  end if;
  if not found then raise exception 'Checkout não pode ser registrado.' using errcode='PT409'; end if;
  return jsonb_build_object('id',c.id,'status',c.status,'checkout_url',c.checkout_url);
end;
$$;

create or replace function public.fail_course_payment_checkout(p_checkout_id uuid, p_error text)
returns void language sql volatile security definer set search_path = '' as $$
  update public.course_payment_checkouts set status='failed',last_error=left(coalesce(p_error,'provider_error'),300),updated_at=clock_timestamp()
   where id=p_checkout_id and status='creating';
$$;

-- O servidor financeiro tambem pode cancelar uma reserva ainda nao paga ou
-- revogar uma matricula depois de estorno integral/chargeback confirmado.
create or replace function public.course_enrollment_transition(p_id uuid, p_expected timestamptz, p_to text, p_actor_kind text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare r public.course_enrollment_requests%rowtype; permitido boolean; v_de text;
begin
  select * into r from public.course_enrollment_requests where id=p_id for update;
  if not found then raise exception 'Inscrição inexistente.' using errcode='P0002'; end if;
  if p_expected is not null and r.updated_at is distinct from p_expected then
    raise exception 'A inscrição mudou. Recarregue a lista.' using errcode='PT409';
  end if;
  permitido := case
    when p_to='aguardando_pagamento' then r.status='solicitada' and r.price_cents>0
    when p_to='matriculada' and p_actor_kind='administracao' then r.status='solicitada' and r.price_cents=0
    when p_to='pagamento_confirmado' then p_actor_kind='servidor' and r.status='aguardando_pagamento'
    when p_to='matriculada' and p_actor_kind='servidor' then r.status='pagamento_confirmado'
    when p_to='recusada' then p_actor_kind='administracao' and r.status in ('solicitada','aguardando_pagamento')
    when p_to='cancelada' and p_actor_kind='aluno' then r.status in ('solicitada','aguardando_pagamento')
      and not exists(select 1 from public.course_payment_checkouts c where c.request_id=r.id and c.status in ('creating','active','paid','manual_review','disputed'))
    when p_to='cancelada' and p_actor_kind='administracao' then r.status in ('solicitada','aguardando_pagamento','pagamento_confirmado','matriculada')
    when p_to='cancelada' and p_actor_kind='servidor' then r.status in ('aguardando_pagamento','pagamento_confirmado','matriculada')
    else false end;
  if not permitido then raise exception 'Mudança de situação não permitida (% para %).',r.status,p_to using errcode='22023'; end if;
  v_de:=r.status;
  update public.course_enrollment_requests set status=p_to,updated_at=clock_timestamp(),
    decided_at=case when p_actor_kind='administracao' then clock_timestamp() else decided_at end,
    decided_by=case when p_actor_kind='administracao' then (select auth.uid()) else decided_by end
   where id=p_id returning * into r;
  insert into public.course_enrollment_request_events(request_id,actor_id,actor_kind,from_status,to_status)
  values(p_id,(select auth.uid()),p_actor_kind,v_de,p_to);
  if p_to='matriculada' then
    update public.course_enrollment_requests set op_enrollment_id=public.course_enrollment_materialize(p_id,p_actor_kind)
     where id=p_id returning * into r;
  elsif p_to='cancelada' and v_de in ('matriculada','pagamento_confirmado') and r.op_enrollment_id is not null then
    perform public.course_enrollment_dematerialize(r.op_enrollment_id);
  end if;
  return jsonb_build_object('id',r.id,'status',r.status,'updated_at',r.updated_at);
end;
$$;

-- Persiste o evento antes de processar. Duplicatas retornam replayed=true. O
-- total vem dos itens do Checkout; para eventos de cobranca usa payment.value.
create or replace function public.process_course_payment_webhook(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_event_id text:=nullif(btrim(p_payload->>'id'),'');
  v_type text:=nullif(btrim(p_payload->>'event'),'');
  v_checkout_id text:=nullif(btrim(p_payload->'checkout'->>'id'),'');
  v_external text:=nullif(btrim(coalesce(p_payload->'checkout'->>'externalReference',p_payload->'payment'->>'externalReference')),'');
  v_status text:=upper(coalesce(p_payload->'checkout'->>'status',p_payload->'payment'->>'status',''));
  v_amount numeric;
  v_amount_cents integer;
  v_event bigint;
  c public.course_payment_checkouts%rowtype;
  v_result jsonb;
begin
  if v_event_id is null or v_type is null or length(v_event_id)>200 or length(v_type)>80 then
    raise exception 'Evento Asaas inválido.' using errcode='22023';
  end if;
  insert into public.course_payment_webhook_events(environment,provider_event_id,event_type,provider_checkout_id,external_reference,payload)
  values('sandbox',v_event_id,v_type,v_checkout_id,v_external,p_payload)
  on conflict(provider,environment,provider_event_id) do update
    set payload=excluded.payload,received_at=clock_timestamp(),processing_status='received',processing_error=null
    where course_payment_webhook_events.processing_status='failed'
  returning id into v_event;
  if v_event is null then return jsonb_build_object('processed',true,'replayed',true); end if;

  if v_checkout_id is not null then
    select * into c from public.course_payment_checkouts where provider_checkout_id=v_checkout_id for update;
  elsif v_external ~ '^course:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
    select * into c from public.course_payment_checkouts where external_reference=v_external order by created_at desc limit 1 for update;
  end if;
  if not found then
    update public.course_payment_webhook_events set processing_status='failed',processing_error='checkout_not_found' where id=v_event;
    return jsonb_build_object('processed',false,'error','checkout_not_found','replayed',false);
  end if;
  if v_external is not null and v_external<>c.external_reference then
    update public.course_payment_webhook_events set processing_status='failed',processing_error='external_reference_mismatch' where id=v_event;
    return jsonb_build_object('processed',false,'error','external_reference_mismatch','replayed',false);
  end if;
  if p_payload ? 'checkout' then
    select coalesce(sum((x->>'quantity')::integer*(x->>'value')::numeric),0) into v_amount
      from jsonb_array_elements(coalesce(p_payload->'checkout'->'items','[]'::jsonb)) x
      where (x->>'quantity') ~ '^[1-9][0-9]*$' and (x->>'value') ~ '^[0-9]+([.][0-9]{1,2})?$';
  else
    v_amount:=(p_payload->'payment'->>'value')::numeric;
  end if;
  v_amount_cents:=round(coalesce(v_amount,-1)*100)::integer;
  if v_amount_cents<>c.amount_cents then
    update public.course_payment_webhook_events set processing_status='failed',processing_error='amount_mismatch' where id=v_event;
    return jsonb_build_object('processed',false,'error','amount_mismatch','replayed',false);
  end if;

  if v_type='CHECKOUT_PAID' and v_status='PAID' then
    if c.status in ('refunded','disputed','manual_review')
      or (select status from public.course_enrollment_requests where id=c.request_id) in ('cancelada','recusada') then
      update public.course_payment_checkouts set status='manual_review',provider_status=v_status,
        paid_at=coalesce(paid_at,clock_timestamp()),updated_at=clock_timestamp(),last_error='paid_after_request_closed' where id=c.id;
      update public.course_payment_webhook_events set processing_status='manual_review',processed_at=clock_timestamp() where id=v_event;
      return jsonb_build_object('processed',true,'manual_review',true,'replayed',false);
    end if;
    update public.course_payment_checkouts set status='paid',provider_status=v_status,paid_at=coalesce(paid_at,clock_timestamp()),updated_at=clock_timestamp() where id=c.id;
    v_result:=public.confirm_course_enrollment_payment(c.request_id,c.amount_cents);
  elsif v_type in ('CHECKOUT_CANCELED','CHECKOUT_EXPIRED') and v_status in ('CANCELED','EXPIRED') then
    update public.course_payment_checkouts set status=lower(v_status),provider_status=v_status,updated_at=clock_timestamp() where id=c.id and status not in ('paid','refunded');
    if (select status from public.course_enrollment_requests where id=c.request_id)='aguardando_pagamento' then
      v_result:=public.course_enrollment_transition(c.request_id,null,'cancelada','servidor');
    end if;
  elsif v_type in ('PAYMENT_REFUNDED','PAYMENT_CHARGEBACK_REQUESTED') then
    update public.course_payment_checkouts set status=case when v_type='PAYMENT_REFUNDED' then 'refunded' else 'disputed' end,
      provider_status=v_status,reversed_at=clock_timestamp(),updated_at=clock_timestamp() where id=c.id;
    if (select status from public.course_enrollment_requests where id=c.request_id) in ('aguardando_pagamento','pagamento_confirmado','matriculada') then
      v_result:=public.course_enrollment_transition(c.request_id,null,'cancelada','servidor');
    end if;
  elsif v_type in ('PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_DISPUTE') then
    update public.course_payment_checkouts set status='manual_review',provider_status=v_status,updated_at=clock_timestamp() where id=c.id;
    update public.course_payment_webhook_events set processing_status='manual_review',processed_at=clock_timestamp() where id=v_event;
    return jsonb_build_object('processed',true,'manual_review',true,'replayed',false);
  else
    update public.course_payment_webhook_events set processing_status='ignored',processed_at=clock_timestamp() where id=v_event;
    return jsonb_build_object('processed',true,'ignored',true,'replayed',false);
  end if;
  update public.course_payment_webhook_events set processing_status='processed',processed_at=clock_timestamp() where id=v_event;
  return jsonb_build_object('processed',true,'replayed',false,'result',v_result);
exception when others then
  -- A chamada inteira e transacional: erro nao deixa evento pela metade. A Edge
  -- Function responde nao-2xx para o Asaas reenviar o mesmo evento.
  raise;
end;
$$;

-- Meu Potala recebe apenas o estado e a URL do proprio Checkout.
create or replace function public.my_course_enrollment_requests()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'status',r.status,'price_cents',r.price_cents,'created_at',r.created_at,'updated_at',r.updated_at,
    'offering_id',r.offering_id,'course_title',left(coalesce(nullif(btrim(d.document->>'title'),''),nullif(btrim(o.document->>'title'),''),'Curso'),160),
    'mode',case when o.document->>'mode'='online' then 'online' else 'presencial' end,
    'payment_status',c.status,'checkout_url',case when c.status='active' then c.checkout_url end,
    'next_session_at',(select min((s.document->>'starts_at')::timestamptz) from public.op_records s
      where s.collection='schedule_items' and s.document->>'offering_id'=r.offering_id
        and coalesce(s.document->>'status','booked')='booked' and (s.document->>'ends_at')::timestamptz>now())
  ) order by r.created_at desc),'[]'::jsonb)
  from public.course_enrollment_requests r
  left join public.op_records o on o.collection='activity_offerings' and o.id=r.offering_id
  left join public.op_records d on d.collection='activity_definitions' and d.id=r.course_id
  left join lateral (select x.status,x.checkout_url from public.course_payment_checkouts x where x.request_id=r.id order by x.created_at desc limit 1) c on true
  where r.user_id=(select auth.uid());
$$;

revoke all on function public.prepare_course_payment_checkout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_course_payment_checkout(uuid,uuid) to authenticated;
revoke all on function public.register_course_payment_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_course_payment_checkout(uuid,text,text) to service_role;
revoke all on function public.fail_course_payment_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.fail_course_payment_checkout(uuid,text) to service_role;
revoke all on function public.process_course_payment_webhook(jsonb) from public,anon,authenticated;
grant execute on function public.process_course_payment_webhook(jsonb) to service_role;
revoke all on function public.course_enrollment_transition(uuid,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.my_course_enrollment_requests() from public,anon,authenticated;
grant execute on function public.my_course_enrollment_requests() to authenticated;

commit;
