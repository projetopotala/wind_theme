-- P1D | INTEGRIDADE DAS INSCRIÇÕES DA OPERAÇÃO (op_records).
--
-- Até aqui o banco garantia, para inscrições, só o que op_apply confere para
-- qualquer coleção: permissão (is_portal_admin), revisão (PT409), chave de
-- repetição, coleção permitida e id do documento. As regras de inscrição
-- (capacidade, inscrição repetida, referências, situação) existiam apenas no
-- motor que roda no navegador (outputs/js/admin/operations/schedule.js).
--
-- Esta migration acrescenta, sem reescrever op_apply nem mudar o formato dos
-- documentos, as mesmas regras do motor dentro do banco:
--
--   1. Uma inscrição por pessoa e turma (índice único parcial). É a regra do
--      motor: reinscrição é a EDIÇÃO da inscrição existente (cancelada → ativa),
--      nunca uma segunda linha. Por ser índice, vale também entre transações.
--   2. Situação ∈ {active, waitlist, completed, cancelled}; profile_id e
--      offering_id textos não vazios que apontam para registros existentes.
--   3. Capacidade da turma: inscrições que ocupam vaga (active, completed) não
--      passam de activity_offerings.capacity (nulo = sem limite). Vale para
--      inscrição nova, reativação, promoção da lista de espera e troca de
--      turma. A turma não pode ter a capacidade reduzida abaixo das vagas
--      ocupadas. Capacidade, quando existe, é inteiro de 1 a 999999999.
--   4. Remoção: pessoa ou turma com inscrição não pode ser apagada; inscrição
--      referida por participante de aula também não.
--   5. Escopo da operação: op_apply registra no mesmo evento de auditoria a ação
--      declarada e as coleções alteradas. Inscrições só podem ser alteradas pela
--      ação enrollment.save, que só pode alterar inscrições; turmas só por
--      offering.save, que só pode alterar turmas. O evento é gravado na mesma
--      transação, então a recusa desfaz a operação inteira.
--
-- Concorrência: a verificação de capacidade trava a turma (pg_advisory_xact_lock
-- pela turma) antes de contar; a trava só é liberada no fim da transação, e a
-- contagem seguinte (READ COMMITTED) enxerga o que a anterior gravou. Inscrição
-- e mudança de capacidade da mesma turma usam a mesma trava. Isto vale mesmo
-- fora de op_apply, que além disso já põe as gravações em fila (op_meta).
--
-- Dados existentes: nada é alterado. A migration recusa a aplicação se algum
-- registro atual violar as regras (as contagens saem na mensagem).
--
-- Reversão: supabase/rollbacks/202611120001_rollback_integridade_inscricoes.sql.

begin;

-- ------------------------------------------------------------------
-- Pré-condições: estrutura esperada e dados compatíveis.
-- ------------------------------------------------------------------
do $preflight$
declare
  repetidas integer; situacao integer; referencias integer; orfas integer;
  capacidade integer; lotadas integer; participantes integer; indice_outro integer;
begin
  if to_regclass('public.op_records') is null
    or to_regclass('public.op_meta') is null
    or to_regprocedure('public.op_apply(bigint,text,text,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.is_portal_admin()') is null then
    raise exception 'P1D: dependências da operação do Instituto não instaladas.';
  end if;

  select count(*) into repetidas from (
    select 1 from public.op_records where collection = 'enrollments'
    group by document ->> 'profile_id', document ->> 'offering_id' having count(*) > 1) x;
  select count(*) into situacao from public.op_records
   where collection = 'enrollments'
     and coalesce(document ->> 'status', '') not in ('active', 'waitlist', 'completed', 'cancelled');
  select count(*) into referencias from public.op_records
   where collection = 'enrollments'
     and (jsonb_typeof(document -> 'profile_id') is distinct from 'string' or btrim(document ->> 'profile_id') = ''
       or jsonb_typeof(document -> 'offering_id') is distinct from 'string' or btrim(document ->> 'offering_id') = '');
  select count(*) into orfas from public.op_records e
   where e.collection = 'enrollments'
     and (not exists (select 1 from public.op_records p where p.collection = 'profiles' and p.id = e.document ->> 'profile_id')
       or not exists (select 1 from public.op_records o where o.collection = 'activity_offerings' and o.id = e.document ->> 'offering_id'));
  select count(*) into capacidade from public.op_records
   where collection = 'activity_offerings'
     and coalesce(jsonb_typeof(document -> 'capacity'), 'null') <> 'null'
     and not (jsonb_typeof(document -> 'capacity') = 'number' and (document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$');
  select count(*) into lotadas from public.op_records o
   where o.collection = 'activity_offerings'
     and jsonb_typeof(o.document -> 'capacity') = 'number' and (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$'
     and (select count(*) from public.op_records e
           where e.collection = 'enrollments' and e.document ->> 'offering_id' = o.id
             and e.document ->> 'status' in ('active', 'completed')) > (o.document ->> 'capacity')::integer;
  select count(*) into participantes from public.op_records sp
   where sp.collection = 'schedule_participants' and nullif(sp.document ->> 'enrollment_id', '') is not null
     and not exists (select 1 from public.op_records e where e.collection = 'enrollments' and e.id = sp.document ->> 'enrollment_id');
  select count(*) into indice_outro from pg_catalog.pg_class c
   where c.relname = 'op_records_enrollment_pessoa_turma' and c.relnamespace = 'public'::regnamespace
     and pg_catalog.pg_get_indexdef(c.oid) not like '%((document ->> ''profile_id''::text)), ((document ->> ''offering_id''::text))) WHERE (collection = ''enrollments''::text)%';

  if repetidas + situacao + referencias + orfas + capacidade + lotadas + participantes + indice_outro > 0 then
    raise exception 'P1D recusada: dados incompatíveis (inscrições repetidas=%, situação inválida=%, identificadores inválidos=%, referências inexistentes=%, capacidade inválida=%, turmas acima da capacidade=%, participantes com inscrição inexistente=%, índice homônimo diferente=%). Nada foi alterado.',
      repetidas, situacao, referencias, orfas, capacidade, lotadas, participantes, indice_outro;
  end if;
end;
$preflight$;

-- ------------------------------------------------------------------
-- 1. Uma inscrição por pessoa e turma (qualquer situação).
-- ------------------------------------------------------------------
create unique index if not exists op_records_enrollment_pessoa_turma
  on public.op_records ((document ->> 'profile_id'), (document ->> 'offering_id'))
  where collection = 'enrollments';

-- ------------------------------------------------------------------
-- Capacidade de uma turma a partir do documento (nulo = sem limite).
-- ------------------------------------------------------------------
create or replace function public.op_turma_capacidade(documento jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if documento is null or coalesce(jsonb_typeof(documento -> 'capacity'), 'null') = 'null' then
    return null;
  end if;
  if jsonb_typeof(documento -> 'capacity') = 'number' and (documento ->> 'capacity') ~ '^[1-9][0-9]{0,8}$' then
    return (documento ->> 'capacity')::integer;
  end if;
  raise exception 'Capacidade da turma inválida.' using errcode = '22023';
end;
$$;

-- ------------------------------------------------------------------
-- 2 e 3. Inscrições e turmas: referências, situação e capacidade.
-- ------------------------------------------------------------------
create or replace function public.validate_op_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  situacao text;
  pessoa text;
  turma text;
  turma_anterior text;
  capacidade integer;
  ocupadas integer;
  documento_turma jsonb;
begin
  if tg_op = 'DELETE' then
    if old.collection = 'profiles' and exists (
      select 1 from public.op_records e where e.collection = 'enrollments' and e.document ->> 'profile_id' = old.id
    ) then
      raise exception 'Pessoa com inscrição não pode ser removida.' using errcode = '23503';
    end if;
    if old.collection = 'activity_offerings' then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('op_turma:' || old.id, 0));
      if exists (select 1 from public.op_records e where e.collection = 'enrollments' and e.document ->> 'offering_id' = old.id) then
        raise exception 'Turma com inscrição não pode ser removida.' using errcode = '23503';
      end if;
    end if;
    if old.collection = 'enrollments' and exists (
      select 1 from public.op_records sp where sp.collection = 'schedule_participants' and sp.document ->> 'enrollment_id' = old.id
    ) then
      raise exception 'Inscrição ligada a participante de aula não pode ser removida.' using errcode = '23503';
    end if;
    return old;
  end if;

  if new.collection = 'activity_offerings' then
    capacidade := public.op_turma_capacidade(new.document);
    if capacidade is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('op_turma:' || new.id, 0));
      select count(*) into ocupadas from public.op_records e
       where e.collection = 'enrollments' and e.document ->> 'offering_id' = new.id
         and e.document ->> 'status' in ('active', 'completed');
      if ocupadas > capacidade then
        raise exception 'Capacidade inferior às inscrições existentes (% ocupadas).', ocupadas using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- new.collection = 'enrollments'
  situacao := new.document ->> 'status';
  if jsonb_typeof(new.document -> 'status') is distinct from 'string'
     or situacao not in ('active', 'waitlist', 'completed', 'cancelled') then
    raise exception 'Situação da inscrição inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(new.document -> 'profile_id') is distinct from 'string'
     or jsonb_typeof(new.document -> 'offering_id') is distinct from 'string' then
    raise exception 'Inscrição sem pessoa ou turma.' using errcode = '22023';
  end if;
  pessoa := btrim(new.document ->> 'profile_id');
  turma := btrim(new.document ->> 'offering_id');
  if pessoa = '' or turma = '' or char_length(pessoa) > 160 or char_length(turma) > 160
     or pessoa <> new.document ->> 'profile_id' or turma <> new.document ->> 'offering_id' then
    raise exception 'Identificador de pessoa ou turma inválido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.op_records p where p.collection = 'profiles' and p.id = pessoa) then
    raise exception 'Pessoa não encontrada.' using errcode = '23503';
  end if;

  -- Trava a turma (e a anterior, se a inscrição mudou de turma), sempre na mesma ordem.
  select r.document ->> 'offering_id' into turma_anterior
    from public.op_records r where r.collection = 'enrollments' and r.id = new.id;
  if turma_anterior is not null and turma_anterior <> turma then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('op_turma:' || least(turma, turma_anterior), 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('op_turma:' || greatest(turma, turma_anterior), 0));
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('op_turma:' || turma, 0));
  end if;

  select o.document into documento_turma
    from public.op_records o where o.collection = 'activity_offerings' and o.id = turma;
  if not found then
    raise exception 'Turma não encontrada.' using errcode = '23503';
  end if;

  if situacao in ('active', 'completed') then
    capacidade := public.op_turma_capacidade(documento_turma);
    if capacidade is not null then
      select count(*) into ocupadas from public.op_records e
       where e.collection = 'enrollments' and e.id <> new.id
         and e.document ->> 'offering_id' = turma
         and e.document ->> 'status' in ('active', 'completed');
      if ocupadas >= capacidade then
        raise exception 'Capacidade da turma esgotada.' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- 5. Escopo: a ação declarada no evento de auditoria x coleções alteradas.
-- ------------------------------------------------------------------
create or replace function public.validate_op_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acao text := new.document ->> 'action';
  tabelas text[];
begin
  if jsonb_typeof(new.document -> 'changes') = 'array' then
    select coalesce(array_agg(distinct c ->> 'table'), '{}') into tabelas
      from jsonb_array_elements(new.document -> 'changes') as c;
  else
    tabelas := '{}';
  end if;

  if 'enrollments' = any (tabelas) and acao is distinct from 'enrollment.save' then
    raise exception 'Operação fora do escopo: inscrições só são alteradas por enrollment.save.' using errcode = '22023';
  end if;
  if acao = 'enrollment.save' and exists (select 1 from unnest(tabelas) t where t <> 'enrollments') then
    raise exception 'Operação fora do escopo: enrollment.save só altera inscrições.' using errcode = '22023';
  end if;
  if 'activity_offerings' = any (tabelas) and acao is distinct from 'offering.save' then
    raise exception 'Operação fora do escopo: turmas só são alteradas por offering.save.' using errcode = '22023';
  end if;
  if acao = 'offering.save' and exists (select 1 from unnest(tabelas) t where t <> 'activity_offerings') then
    raise exception 'Operação fora do escopo: offering.save só altera turmas.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.op_turma_capacidade(jsonb) from public, anon, authenticated;
revoke all on function public.validate_op_enrollment() from public, anon, authenticated;
revoke all on function public.validate_op_scope() from public, anon, authenticated;

drop trigger if exists op_records_validate_enrollment on public.op_records;
create trigger op_records_validate_enrollment
  before insert or update on public.op_records
  for each row
  when (new.collection in ('enrollments', 'activity_offerings'))
  execute function public.validate_op_enrollment();

drop trigger if exists op_records_protect_enrollment_refs on public.op_records;
create trigger op_records_protect_enrollment_refs
  before delete on public.op_records
  for each row
  when (old.collection in ('enrollments', 'activity_offerings', 'profiles'))
  execute function public.validate_op_enrollment();

drop trigger if exists op_records_validate_scope on public.op_records;
create trigger op_records_validate_scope
  before insert on public.op_records
  for each row
  when (new.collection = 'audit_events')
  execute function public.validate_op_scope();

-- ------------------------------------------------------------------
-- Verificação final: os objetos ficaram como esperado.
-- ------------------------------------------------------------------
do $verificacao$
begin
  if (select count(*) from pg_catalog.pg_trigger
       where tgrelid = 'public.op_records'::regclass and not tgisinternal and tgenabled = 'O'
         and tgname in ('op_records_validate_enrollment', 'op_records_protect_enrollment_refs', 'op_records_validate_scope')) <> 3 then
    raise exception 'P1D: gatilhos não ficaram ativos.';
  end if;
  if to_regclass('public.op_records_enrollment_pessoa_turma') is null then
    raise exception 'P1D: índice de inscrição única não foi criado.';
  end if;
  if exists (select 1 from pg_catalog.pg_proc
              where pronamespace = 'public'::regnamespace
                and proname in ('validate_op_enrollment', 'validate_op_scope', 'op_turma_capacidade')
                and (proconfig is null or not ('search_path=""' = any (proconfig)))) then
    raise exception 'P1D: função sem search_path fixo.';
  end if;
end;
$verificacao$;

commit;
