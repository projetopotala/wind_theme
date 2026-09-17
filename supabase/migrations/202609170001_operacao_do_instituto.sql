-- A OPERAÇÃO DO INSTITUTO: salas, agenda, pessoas, inventário e financeiro.
--
-- Até aqui a operação vivia num SQLite da máquina de quem rodava o preview, e
-- no site publicado o painel não abria. Esta migração leva o mesmo modelo para
-- o banco do Portal, sem mudar a forma dos registros que as telas já usam.
--
-- Cada registro é um documento JSON numa coleção (rooms, schedule_items…).
-- As regras de domínio rodam no navegador contra uma revisão conhecida do
-- estado; public.op_apply grava o resultado numa transação só e recusa se a
-- revisão mudou no meio. É o banco que decide:
--   * quem grava — só owner/admin ativo em public.users (is_portal_admin);
--   * se o estado ainda é o que a regra viu — revisão com trava de linha;
--   * se o pedido é repetição — identificador de idempotência;
--   * códigos únicos de sala e de patrimônio — índices únicos.
-- Toda gravação deixa um evento de auditoria com antes/depois e o autor
-- tirado da sessão, não do que o navegador diz.
--
-- As tabelas não têm grant a anon nem a authenticated: só as duas funções
-- abaixo (security definer) as alcançam.
--
-- Os nomes levam o prefixo op_ para não colidir com public.schedule_items e
-- public.enrollments da conta do visitante (202609140001_conta_visitante.sql).

begin;

create table if not exists public.op_records (
  collection text not null check (collection in (
    'rooms', 'profiles', 'activity_definitions', 'activity_offerings', 'offering_professionals',
    'schedule_items', 'schedule_series', 'schedule_participants', 'enrollments',
    'inventory_items', 'inventory_assets', 'inventory_balances', 'inventory_movements', 'maintenance_orders',
    'financial_entries', 'payments', 'payment_allocations', 'split_rules', 'split_allocations', 'audit_events'
  )),
  id text not null check (char_length(id) between 1 and 160),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  ordem bigint generated always as identity,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create index if not exists op_records_collection_ordem_idx
  on public.op_records (collection, ordem);

create unique index if not exists op_records_room_code
  on public.op_records ((document ->> 'code'))
  where collection = 'rooms';

create unique index if not exists op_records_asset_code
  on public.op_records ((document ->> 'asset_code'))
  where collection = 'inventory_assets';

create table if not exists public.op_meta (
  id smallint primary key check (id = 1),
  revision bigint not null default 0 check (revision >= 0)
);

insert into public.op_meta (id, revision) values (1, 0) on conflict (id) do nothing;

create table if not exists public.op_requests (
  id text primary key check (char_length(id) between 3 and 160),
  digest text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.op_records enable row level security;
alter table public.op_meta enable row level security;
alter table public.op_requests enable row level security;

revoke all on table public.op_records from anon, authenticated;
revoke all on table public.op_meta from anon, authenticated;
revoke all on table public.op_requests from anon, authenticated;

-- ------------------------------------------------------------------
-- Leitura
-- ------------------------------------------------------------------

-- A auditoria cresce a cada gravação; o painel mostra as mais recentes.
create or replace function public.op_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resultado jsonb;
  colecao text;
begin
  if not public.is_portal_admin() then
    raise exception 'Seu acesso não permite usar a operação do Instituto.' using errcode = '42501';
  end if;

  select jsonb_build_object('revision', meta.revision)
    into resultado
  from public.op_meta as meta
  where meta.id = 1;

  foreach colecao in array array[
    'rooms', 'profiles', 'activity_definitions', 'activity_offerings', 'offering_professionals',
    'schedule_items', 'schedule_series', 'schedule_participants', 'enrollments',
    'inventory_items', 'inventory_assets', 'inventory_balances', 'inventory_movements', 'maintenance_orders',
    'financial_entries', 'payments', 'payment_allocations', 'split_rules', 'split_allocations'
  ] loop
    resultado := resultado || jsonb_build_object(colecao, coalesce((
      select jsonb_agg(registro.document order by registro.ordem)
      from public.op_records as registro
      where registro.collection = colecao
    ), '[]'::jsonb));
  end loop;

  resultado := resultado || jsonb_build_object('audit_events', coalesce((
    select jsonb_agg(recentes.document order by recentes.ordem)
    from (
      select registro.document, registro.ordem
      from public.op_records as registro
      where registro.collection = 'audit_events'
      order by registro.ordem desc
      limit 300
    ) as recentes
  ), '[]'::jsonb));

  return resultado;
end;
$$;

revoke all on function public.op_snapshot() from public, anon;
grant execute on function public.op_snapshot() to authenticated;

-- ------------------------------------------------------------------
-- Escrita
-- ------------------------------------------------------------------

create or replace function public.op_apply(
  p_revision bigint,
  p_idempotency_key text,
  p_action text,
  p_payload jsonb,
  p_result jsonb,
  p_changes jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  atual bigint;
  pedido_anterior public.op_requests%rowtype;
  assinatura text;
  autor text;
  mudanca jsonb;
  tabela text;
  chave text;
  depois jsonb;
  antes jsonb;
  alteracoes jsonb := '[]'::jsonb;
  agora timestamptz := now();
  evento jsonb;
  resposta jsonb;
begin
  if not public.is_portal_admin() then
    raise exception 'Seu acesso não permite alterar a operação do Instituto.' using errcode = '42501';
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) not between 3 and 160 then
    raise exception 'Identificador da operação inválido.' using errcode = '22023';
  end if;
  if p_action is null or btrim(p_action) = '' or char_length(p_action) > 80 then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Comando inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) > 5000 then
    raise exception 'Lista de alterações inválida.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(usuario.name), ''), usuario.email)
    into autor
  from public.users as usuario
  where usuario.id = (select auth.uid());

  assinatura := md5(jsonb_build_object('type', p_action, 'payload', p_payload, 'actor', autor)::text);

  -- A trava da linha de revisão põe as gravações em fila.
  select meta.revision into atual from public.op_meta as meta where meta.id = 1 for update;

  select * into pedido_anterior from public.op_requests as pedido where pedido.id = p_idempotency_key;
  if found then
    if pedido_anterior.digest <> assinatura then
      raise exception 'Identificador reutilizado para outra operação.' using errcode = '22023';
    end if;
    return pedido_anterior.result;
  end if;

  if p_revision is distinct from atual then
    raise exception 'Os dados foram atualizados em outra janela. Atualize e tente novamente.' using errcode = 'PT409';
  end if;

  for mudanca in select elemento from jsonb_array_elements(p_changes) as elemento loop
    tabela := mudanca ->> 'table';
    chave := mudanca ->> 'id';
    depois := mudanca -> 'after';

    if tabela is null or tabela = 'audit_events' or tabela not in (
      'rooms', 'profiles', 'activity_definitions', 'activity_offerings', 'offering_professionals',
      'schedule_items', 'schedule_series', 'schedule_participants', 'enrollments',
      'inventory_items', 'inventory_assets', 'inventory_balances', 'inventory_movements', 'maintenance_orders',
      'financial_entries', 'payments', 'payment_allocations', 'split_rules', 'split_allocations'
    ) then
      raise exception 'Coleção inválida na operação.' using errcode = '22023';
    end if;
    if chave is null or char_length(chave) not between 1 and 160 then
      raise exception 'Registro sem identificador.' using errcode = '22023';
    end if;

    select registro.document into antes
    from public.op_records as registro
    where registro.collection = tabela and registro.id = chave;

    if depois is null or jsonb_typeof(depois) = 'null' then
      delete from public.op_records as registro where registro.collection = tabela and registro.id = chave;
      depois := null;
    elsif jsonb_typeof(depois) = 'object' and depois ->> 'id' = chave then
      insert into public.op_records (collection, id, document, updated_at)
      values (tabela, chave, depois, agora)
      on conflict (collection, id) do update
        set document = excluded.document, updated_at = excluded.updated_at;
    else
      raise exception 'Registro inconsistente na operação.' using errcode = '22023';
    end if;

    alteracoes := alteracoes || jsonb_build_array(jsonb_build_object(
      'table', tabela, 'id', chave, 'before', antes, 'after', depois
    ));
  end loop;

  evento := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'actor', coalesce(autor, 'Administração Potala'),
    'at', to_char(agora at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'action', p_action,
    'reason', coalesce(p_payload ->> 'reason', ''),
    'changes', alteracoes
  );
  insert into public.op_records (collection, id, document, updated_at)
  values ('audit_events', evento ->> 'id', evento, agora);

  update public.op_meta set revision = atual + 1 where id = 1;

  resposta := jsonb_build_object('result', p_result, 'revision', atual + 1);
  insert into public.op_requests (id, digest, result) values (p_idempotency_key, assinatura, resposta);
  return resposta;
end;
$$;

revoke all on function public.op_apply(bigint, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.op_apply(bigint, text, text, jsonb, jsonb, jsonb) to authenticated;

commit;
