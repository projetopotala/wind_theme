-- PR B de Cursos: inscricao pedida pelo proprio aluno e gestao pelo Owner.
--
-- Nao altera as matriculas da operacao (op_records enrollments) nem suas regras (202611120001). Os pedidos do aluno
-- ficam em uma tabela propria, ligada a conta (auth.uid()):
--   public.course_enrollment_requests: aluno, turma, curso, estado, valor congelado em centavos, chave de repeticao.
--   public.course_enrollment_request_events: auditoria de cada mudanca de estado (quem, de, para, quando).
--
-- Estados: solicitada -> (Owner aprova) -> aguardando_pagamento (curso pago) | matriculada (curso gratuito)
--          aguardando_pagamento -> pagamento_confirmado -> matriculada  (SO pelo servidor: confirm_course_enrollment_payment,
--          executavel apenas por service_role, para o futuro webhook autenticado do Asaas; ninguem do navegador marca pago)
--          solicitada | aguardando_pagamento -> recusada (Owner) ; qualquer estado nao final -> cancelada (Owner ou o aluno,
--          o aluno so antes de pagar). Recusada e cancelada sao finais.
-- Vagas: course_seats_taken(turma) = matriculas da operacao que ocupam vaga (active, completed) + pedidos em andamento
--   (solicitada, aguardando_pagamento, pagamento_confirmado, matriculada). Pedido pendente RESERVA a vaga; recusa e
--   cancelamento liberam. Expiracao automatica de pedidos fica para a integracao de pagamento (o Owner pode cancelar).
-- Concorrencia: pedidos e matriculas manuais da mesma turma usam a mesma trava (pg_advisory_xact_lock 'op_turma:'||turma,
--   a mesma de op_turma_capacidade). Um gatilho extra na operacao impede que uma matricula manual passe da capacidade
--   contando tambem os pedidos em andamento. Matriculas existentes nao sao revalidadas (so novas gravacoes).
-- list_public_courses: igual a 202611160006, mas "vagas restantes" passa a descontar os pedidos em andamento.
-- Reversao: supabase/rollbacks/202611160007_rollback_cursos_inscricao_aluno.sql (preserva pedidos reais).

begin;

create table if not exists public.course_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  offering_id text not null check (char_length(offering_id) between 1 and 160),
  course_id text not null check (char_length(course_id) between 1 and 160),
  status text not null default 'solicitada'
    check (status in ('solicitada', 'aguardando_pagamento', 'pagamento_confirmado', 'matriculada', 'recusada', 'cancelada')),
  price_cents integer not null check (price_cents between 0 and 999999999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);
create unique index if not exists course_enrollment_requests_um_ativo
  on public.course_enrollment_requests (user_id, offering_id)
  where status in ('solicitada', 'aguardando_pagamento', 'pagamento_confirmado', 'matriculada');
create index if not exists course_enrollment_requests_turma on public.course_enrollment_requests (offering_id, status);

create table if not exists public.course_enrollment_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.course_enrollment_requests (id) on delete cascade,
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('aluno', 'administracao', 'servidor')),
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now()
);

alter table public.course_enrollment_requests enable row level security;
alter table public.course_enrollment_request_events enable row level security;
revoke all on table public.course_enrollment_requests from public, anon, authenticated;
revoke all on table public.course_enrollment_request_events from public, anon, authenticated;
grant select on table public.course_enrollment_requests to authenticated;
drop policy if exists "aluno le os proprios pedidos de inscricao" on public.course_enrollment_requests;
create policy "aluno le os proprios pedidos de inscricao" on public.course_enrollment_requests
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.course_seats_taken(p_offering_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)::integer from public.op_records e
    where e.collection = 'enrollments' and e.document ->> 'offering_id' = p_offering_id
      and coalesce(e.document ->> 'status', 'active') in ('active', 'completed')
  ) + (
    select count(*)::integer from public.course_enrollment_requests r
    where r.offering_id = p_offering_id
      and r.status in ('solicitada', 'aguardando_pagamento', 'pagamento_confirmado', 'matriculada')
  );
$$;
revoke all on function public.course_seats_taken(text) from public, anon, authenticated;

create or replace function public.list_public_courses()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c.linha order by c.ordem, c.titulo), '[]'::jsonb)
  from (
    select
      prox.inicio as ordem,
      left(coalesce(nullif(btrim(o.document ->> 'title'), ''), nullif(btrim(d.document ->> 'title'), '')), 160) as titulo,
      jsonb_build_object(
        'id', o.id,
        'course_id', d.id,
        'title', left(coalesce(nullif(btrim(o.document ->> 'title'), ''), nullif(btrim(d.document ->> 'title'), '')), 160),
        'summary', left(coalesce(nullif(btrim(o.document ->> 'summary'), ''), btrim(d.document ->> 'summary')), 600),
        'kind', d.document ->> 'kind',
        'mode', case when o.document ->> 'mode' = 'online' then 'online' else 'presencial' end,
        'capacity', (o.document ->> 'capacity')::integer,
        'spots_left', greatest((o.document ->> 'capacity')::integer - ocup.n, 0),
        'availability', case when ocup.n >= (o.document ->> 'capacity')::integer then 'esgotado' else 'aberta' end,
        'price_cents', preco.centavos,
        'image', case when img.caminho ~* '^media/[a-z0-9][a-z0-9._/-]{0,200}$' and img.caminho not like '%..%' then img.caminho end,
        'teacher_name', left(coalesce(prof.document ->> 'display_name', ''), 120),
        'next_session', jsonb_build_object('starts_at', prox.inicio, 'ends_at', prox.fim, 'mode', prox.modo)
      ) as linha
    from public.op_records o
    join public.op_records d
      on d.collection = 'activity_definitions'
     and d.id = o.document ->> 'definition_id'
     and d.document ->> 'kind' in ('course', 'workshop', 'lecture', 'event', 'cultural')
     and d.document ->> 'published' = 'true'
    join public.op_records prof
      on prof.collection = 'profiles' and prof.id = o.document ->> 'professional_id'
    cross join lateral (
      select case
        when (o.document ->> 'price_cents') ~ '^[0-9]{1,9}$' then (o.document ->> 'price_cents')::integer
        when (d.document ->> 'price_cents') ~ '^[0-9]{1,9}$' then (d.document ->> 'price_cents')::integer
      end as centavos
    ) preco
    cross join lateral (
      select coalesce(nullif(btrim(o.document ->> 'image'), ''), nullif(btrim(d.document ->> 'image'), '')) as caminho
    ) img
    cross join lateral (
      select public.course_seats_taken(o.id) as n
    ) ocup
    join lateral (
      select (s.document ->> 'starts_at')::timestamptz as inicio,
             (s.document ->> 'ends_at')::timestamptz as fim,
             case when s.document ->> 'mode' = 'online' then 'online' else 'presencial' end as modo
      from public.op_records s
      where s.collection = 'schedule_items'
        and s.document ->> 'offering_id' = o.id
        and coalesce(s.document ->> 'status', 'booked') = 'booked'
        and (s.document ->> 'ends_at')::timestamptz > now()
      order by (s.document ->> 'starts_at')::timestamptz, s.id
      limit 1
    ) prox on true
    where o.collection = 'activity_offerings'
      and o.document ->> 'published' = 'true'
      and coalesce(o.document ->> 'active', 'true') <> 'false'
      and (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$'
      and preco.centavos is not null
      and coalesce(nullif(btrim(o.document ->> 'summary'), ''), nullif(btrim(d.document ->> 'summary'), '')) is not null
  ) c;
$$;

-- Matricula manual pela operacao tambem respeita os pedidos em andamento.
create or replace function public.op_enrollment_respeita_pedidos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  turma text := new.document ->> 'offering_id';
  capacidade integer;
  ocupa_antes boolean := false;
begin
  if new.collection <> 'enrollments' or coalesce(new.document ->> 'status', 'active') not in ('active', 'completed') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    ocupa_antes := old.collection = 'enrollments' and old.document ->> 'offering_id' = turma
      and coalesce(old.document ->> 'status', 'active') in ('active', 'completed');
  end if;
  if ocupa_antes then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('op_turma:' || turma, 0));
  select case when (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$' then (o.document ->> 'capacity')::integer end
    into capacidade from public.op_records o where o.collection = 'activity_offerings' and o.id = turma;
  if capacidade is not null and public.course_seats_taken(turma) + 1 > capacidade then
    raise exception 'Capacidade da turma esgotada (inclui pedidos de inscrição em andamento).' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.op_enrollment_respeita_pedidos() from public, anon, authenticated;
drop trigger if exists op_enrollment_respeita_pedidos on public.op_records;
create trigger op_enrollment_respeita_pedidos before insert or update on public.op_records
  for each row execute function public.op_enrollment_respeita_pedidos();

create or replace function public.request_course_enrollment(p_idempotency_key uuid, p_offering_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_turma jsonb;
  v_previo public.course_enrollment_requests%rowtype;
  v_novo public.course_enrollment_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para se inscrever.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null and u.deleted_at is null) then
    raise exception 'Confirme seu e-mail antes de se inscrever.' using errcode = '42501';
  end if;
  if p_idempotency_key is null or nullif(btrim(coalesce(p_offering_id, '')), '') is null then
    raise exception 'Escolha uma turma.' using errcode = '22023';
  end if;
  select * into v_previo from public.course_enrollment_requests where idempotency_key = p_idempotency_key;
  if found then
    if v_previo.user_id is distinct from v_uid or v_previo.offering_id is distinct from p_offering_id then
      raise exception 'Chave reutilizada com outros dados.' using errcode = 'PT409';
    end if;
    return jsonb_build_object('id', v_previo.id, 'status', v_previo.status, 'replayed', true);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('op_turma:' || p_offering_id, 0));
  -- So turma com inscricoes abertas (mesma regra publica: curso e turma publicados, completos, aula futura, valor).
  select x into v_turma from jsonb_array_elements(public.list_public_courses()) x where x ->> 'id' = p_offering_id;
  if v_turma is null then
    raise exception 'Esta turma não está com inscrições abertas.' using errcode = '22023';
  end if;
  if exists (select 1 from public.course_enrollment_requests r where r.user_id = v_uid and r.offering_id = p_offering_id
      and r.status in ('solicitada', 'aguardando_pagamento', 'pagamento_confirmado', 'matriculada')) then
    raise exception 'Você já tem uma inscrição nesta turma.' using errcode = 'PT409';
  end if;
  if public.course_seats_taken(p_offering_id) >= (v_turma ->> 'capacity')::integer then
    raise exception 'Turma lotada.' using errcode = '23514';
  end if;
  insert into public.course_enrollment_requests (idempotency_key, user_id, offering_id, course_id, price_cents)
  values (p_idempotency_key, v_uid, p_offering_id, v_turma ->> 'course_id', (v_turma ->> 'price_cents')::integer)
  returning * into v_novo;
  insert into public.course_enrollment_request_events (request_id, actor_id, actor_kind, from_status, to_status)
  values (v_novo.id, v_uid, 'aluno', null, 'solicitada');
  return jsonb_build_object('id', v_novo.id, 'status', v_novo.status, 'replayed', false);
exception when unique_violation then
  raise exception 'Você já tem uma inscrição nesta turma.' using errcode = 'PT409';
end;
$$;

create or replace function public.my_course_enrollment_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'price_cents', r.price_cents, 'created_at', r.created_at, 'updated_at', r.updated_at,
      'offering_id', r.offering_id,
      'course_title', left(coalesce(nullif(btrim(d.document ->> 'title'), ''), nullif(btrim(o.document ->> 'title'), ''), 'Curso'), 160),
      'mode', case when o.document ->> 'mode' = 'online' then 'online' else 'presencial' end,
      'next_session_at', (select min((s.document ->> 'starts_at')::timestamptz) from public.op_records s
        where s.collection = 'schedule_items' and s.document ->> 'offering_id' = r.offering_id
          and coalesce(s.document ->> 'status', 'booked') = 'booked' and (s.document ->> 'ends_at')::timestamptz > now())
    ) order by r.created_at desc), '[]'::jsonb)
  from public.course_enrollment_requests r
  left join public.op_records o on o.collection = 'activity_offerings' and o.id = r.offering_id
  left join public.op_records d on d.collection = 'activity_definitions' and d.id = r.course_id
  where r.user_id = (select auth.uid());
$$;

-- Mudanca de estado com auditoria. Uso interno (as funcoes publicas abaixo decidem quem pode o que).
create or replace function public.course_enrollment_transition(p_id uuid, p_expected timestamptz, p_to text, p_actor_kind text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.course_enrollment_requests%rowtype;
  permitido boolean;
  v_de text;
begin
  select * into r from public.course_enrollment_requests where id = p_id for update;
  if not found then
    raise exception 'Inscrição inexistente.' using errcode = 'P0002';
  end if;
  if p_expected is not null and r.updated_at is distinct from p_expected then
    raise exception 'A inscrição mudou. Recarregue a lista.' using errcode = 'PT409';
  end if;
  permitido := case
    when p_to = 'aguardando_pagamento' then r.status = 'solicitada' and r.price_cents > 0
    when p_to = 'matriculada' and p_actor_kind = 'administracao' then r.status = 'solicitada' and r.price_cents = 0
    when p_to = 'pagamento_confirmado' then p_actor_kind = 'servidor' and r.status = 'aguardando_pagamento'
    when p_to = 'matriculada' and p_actor_kind = 'servidor' then r.status = 'pagamento_confirmado'
    when p_to = 'recusada' then p_actor_kind = 'administracao' and r.status in ('solicitada', 'aguardando_pagamento')
    when p_to = 'cancelada' and p_actor_kind = 'aluno' then r.status in ('solicitada', 'aguardando_pagamento')
    when p_to = 'cancelada' and p_actor_kind = 'administracao' then r.status in ('solicitada', 'aguardando_pagamento', 'pagamento_confirmado', 'matriculada')
    else false
  end;
  if not permitido then
    raise exception 'Mudança de situação não permitida (% para %).', r.status, p_to using errcode = '22023';
  end if;
  v_de := r.status;
  update public.course_enrollment_requests
     set status = p_to, updated_at = clock_timestamp(),
         decided_at = case when p_actor_kind = 'administracao' then clock_timestamp() else decided_at end,
         decided_by = case when p_actor_kind = 'administracao' then (select auth.uid()) else decided_by end
   where id = p_id returning * into r;
  insert into public.course_enrollment_request_events (request_id, actor_id, actor_kind, from_status, to_status)
  values (p_id, (select auth.uid()), p_actor_kind, v_de, p_to);
  return jsonb_build_object('id', r.id, 'status', r.status, 'updated_at', r.updated_at);
end;
$$;
revoke all on function public.course_enrollment_transition(uuid, timestamptz, text, text) from public, anon, authenticated;

create or replace function public.cancel_my_course_enrollment_request(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.course_enrollment_requests where id = p_id and user_id = (select auth.uid())) then
    raise exception 'Inscrição inexistente.' using errcode = 'P0002';
  end if;
  return public.course_enrollment_transition(p_id, null, 'cancelada', 'aluno');
end;
$$;

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
      'seats_taken', public.course_seats_taken(r.offering_id)
    ) order by r.created_at desc)
    from public.course_enrollment_requests r
    join auth.users u on u.id = r.user_id
    left join public.op_records o on o.collection = 'activity_offerings' and o.id = r.offering_id
    left join public.op_records d on d.collection = 'activity_definitions' and d.id = r.course_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_decide_course_enrollment_request(p_id uuid, p_expected_updated_at timestamptz, p_decision text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.course_enrollment_requests%rowtype;
begin
  if not (select public.is_portal_admin()) then
    raise exception 'Somente a administração decide inscrições.' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or p_decision not in ('aprovar', 'recusar', 'cancelar') then
    raise exception 'Decisão inválida. Recarregue a inscrição.' using errcode = '22023';
  end if;
  select * into r from public.course_enrollment_requests where id = p_id;
  if not found then
    raise exception 'Inscrição inexistente.' using errcode = 'P0002';
  end if;
  return case p_decision
    when 'aprovar' then public.course_enrollment_transition(p_id, p_expected_updated_at,
      case when r.price_cents = 0 then 'matriculada' else 'aguardando_pagamento' end, 'administracao')
    when 'recusar' then public.course_enrollment_transition(p_id, p_expected_updated_at, 'recusada', 'administracao')
    when 'cancelar' then public.course_enrollment_transition(p_id, p_expected_updated_at, 'cancelada', 'administracao')
    else null
  end;
end;
$$;

-- Futuro webhook do Asaas (servidor): pagamento confirmado de verdade -> matriculada. Nunca pelo navegador.
create or replace function public.confirm_course_enrollment_payment(p_id uuid, p_amount_cents integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.course_enrollment_requests%rowtype;
begin
  select * into r from public.course_enrollment_requests where id = p_id;
  if not found then
    raise exception 'Inscrição inexistente.' using errcode = 'P0002';
  end if;
  if r.status in ('pagamento_confirmado', 'matriculada') then
    return jsonb_build_object('id', r.id, 'status', r.status, 'replayed', true);
  end if;
  if p_amount_cents is distinct from r.price_cents then
    raise exception 'Valor pago diferente do valor da inscrição.' using errcode = '22023';
  end if;
  perform public.course_enrollment_transition(p_id, null, 'pagamento_confirmado', 'servidor');
  return public.course_enrollment_transition(p_id, null, 'matriculada', 'servidor');
end;
$$;

revoke all on function public.request_course_enrollment(uuid, text) from public, anon, authenticated;
grant execute on function public.request_course_enrollment(uuid, text) to authenticated;
revoke all on function public.my_course_enrollment_requests() from public, anon, authenticated;
grant execute on function public.my_course_enrollment_requests() to authenticated;
revoke all on function public.cancel_my_course_enrollment_request(uuid) from public, anon, authenticated;
grant execute on function public.cancel_my_course_enrollment_request(uuid) to authenticated;
revoke all on function public.admin_list_course_enrollment_requests() from public, anon, authenticated;
grant execute on function public.admin_list_course_enrollment_requests() to authenticated;
revoke all on function public.admin_decide_course_enrollment_request(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.admin_decide_course_enrollment_request(uuid, timestamptz, text) to authenticated;
revoke all on function public.confirm_course_enrollment_payment(uuid, integer) from public, anon, authenticated;
grant execute on function public.confirm_course_enrollment_payment(uuid, integer) to service_role;
revoke all on function public.list_public_courses() from public, anon, authenticated;
grant execute on function public.list_public_courses() to anon, authenticated;

commit;
