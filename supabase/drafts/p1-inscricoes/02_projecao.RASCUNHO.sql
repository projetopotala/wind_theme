-- =====================================================================
-- RASCUNHO — NÃO APLICAR. P1 inscrições, PARTE 2: PROJEÇÃO NO MEU POTALA.
--
-- Só depois da PARTE 1 aplicada e homologada. Exige, na sessão,
-- `set potala.p1_aprovado = 'projecao'`.
--
-- Copia cada inscrição do painel (op_records, coleção 'enrollments') para
-- public.enrollments da conta vinculada à Pessoa. Fonte de verdade: o painel.
--
-- Regras:
--   * nunca apaga linhas de public.enrollments (nem progresso): oculta;
--   * a cópia oculta sai da chave do curso (course_ref = 'oculta:<id>'), para
--     que NENHUMA inscrição nova a reaproveite — só a mesma inscrição do
--     painel, para a mesma conta e a mesma turma, a reexibe;
--   * falha inesperada na cópia NÃO desfaz a operação do painel: fica
--     registrada em public.enrollment_projection_issues;
--   * a administração lista divergências e reconcilia sob demanda
--     (op_inscricoes_divergentes / op_reconciliar_inscricoes).
-- =====================================================================

do $trava$
begin
  if coalesce(current_setting('potala.p1_aprovado', true), '') <> 'projecao' then
    raise exception 'RASCUNHO P1 (projeção): aplicação não autorizada nesta sessão.';
  end if;
end;
$trava$;

begin;

do $dependencias$
begin
  if to_regclass('public.op_profile_accounts') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'enrollments' and column_name = 'op_course_ref'
    ) then
    raise exception 'A PARTE 1 (estrutura) não está aplicada.';
  end if;
end;
$dependencias$;

-- ---------------------------------------------------------------------
-- Registro de falhas da cópia (só a administração lê)
-- ---------------------------------------------------------------------
create table if not exists public.enrollment_projection_issues (
  id bigint generated always as identity primary key,
  op_enrollment_id text,
  sqlstate text not null,
  message text not null,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists enrollment_projection_issues_abertas_idx
  on public.enrollment_projection_issues (occurred_at) where resolved_at is null;
alter table public.enrollment_projection_issues enable row level security;
revoke all on table public.enrollment_projection_issues from public, anon, authenticated;
grant select on table public.enrollment_projection_issues to authenticated;
drop policy if exists "administracao le falhas de projecao" on public.enrollment_projection_issues;
create policy "administracao le falhas de projecao" on public.enrollment_projection_issues
  for select to authenticated using ((select public.is_portal_admin()));

-- ---------------------------------------------------------------------
-- Ocultar = sair da chave do curso; reexibir = voltar a ela.
-- Um único ponto garante isso para qualquer UPDATE que oculte ou reexiba.
-- ---------------------------------------------------------------------
create or replace function public.enrollments_chave_da_ocultacao()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.op_enrollment_id is not null then
    if new.hidden_at is not null and old.hidden_at is null then
      new.course_ref := 'oculta:' || new.id::text;
    elsif new.hidden_at is null and old.hidden_at is not null then
      new.course_ref := new.op_course_ref;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enrollments_chave_da_ocultacao() from public, anon, authenticated;

drop trigger if exists enrollments_chave_da_ocultacao on public.enrollments;
create trigger enrollments_chave_da_ocultacao
  before update of hidden_at on public.enrollments
  for each row execute function public.enrollments_chave_da_ocultacao();

-- ---------------------------------------------------------------------
-- Oculta as cópias visíveis de uma inscrição (sem apagar)
-- ---------------------------------------------------------------------
create or replace function public.op_ocultar_copias(p_op_enrollment_id text, p_motivo text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.enrollments as e
     set hidden_at = now(), hidden_reason = p_motivo
   where e.op_enrollment_id = p_op_enrollment_id
     and e.hidden_at is null;
$$;
revoke all on function public.op_ocultar_copias(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Projeta UMA inscrição do painel
-- ---------------------------------------------------------------------
create or replace function public.op_projetar_inscricao(p_op_enrollment_id text, p_removida boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inscricao jsonb;
  turma jsonb;
  professor jsonb;
  conta uuid;
  situacao text;
  titulo text;
  chave_curso text;
  copia uuid;
begin
  begin
    if p_removida then
      perform public.op_ocultar_copias(p_op_enrollment_id, 'removida');
      return;
    end if;

    select r.document into inscricao
    from public.op_records as r
    where r.collection = 'enrollments' and r.id = p_op_enrollment_id;

    if inscricao is null then
      perform public.op_ocultar_copias(p_op_enrollment_id, 'removida');
      return;
    end if;

    if (inscricao ->> 'status') = 'cancelled' then
      perform public.op_ocultar_copias(p_op_enrollment_id, 'cancelada');
      return;
    end if;

    situacao := case inscricao ->> 'status'
      when 'waitlist' then 'aguardando_turma'
      when 'active' then 'inscrito'
      when 'completed' then 'concluido'
    end;
    if situacao is null then
      raise exception 'Situação desconhecida no painel: %', coalesce(inscricao ->> 'status', '(nula)')
        using errcode = '22023';
    end if;

    if coalesce(inscricao ->> 'profile_id', '') = '' or coalesce(inscricao ->> 'offering_id', '') = '' then
      raise exception 'Inscrição do painel sem pessoa ou sem turma.' using errcode = '22023';
    end if;

    select a.user_id into conta
    from public.op_profile_accounts as a
    where a.op_profile_id = inscricao ->> 'profile_id';

    if conta is null then
      -- Pessoa sem conta ligada (ou a inscrição mudou para alguém sem conta).
      perform public.op_ocultar_copias(p_op_enrollment_id, 'reatribuida');
      return;
    end if;

    select r.document into turma
    from public.op_records as r
    where r.collection = 'activity_offerings' and r.id = inscricao ->> 'offering_id';

    if turma ->> 'professional_id' is not null then
      select r.document into professor
      from public.op_records as r
      where r.collection = 'profiles' and r.id = turma ->> 'professional_id';
    end if;

    titulo := left(coalesce(nullif(btrim(turma ->> 'title'), ''), 'Curso do Instituto'), 160);
    chave_curso := 'op:' || (inscricao ->> 'offering_id');

    -- 1. Cópias visíveis desta inscrição em OUTRA conta ou OUTRA turma: ocultas.
    update public.enrollments as e
       set hidden_at = now(),
           hidden_reason = case when e.user_id <> conta then 'reatribuida' else 'trocada' end
     where e.op_enrollment_id = p_op_enrollment_id
       and e.hidden_at is null
       and (e.user_id <> conta or e.op_course_ref <> chave_curso);

    -- 2. Só se reaproveita a linha DESTA inscrição, DESTA conta, DESTA turma.
    select e.id into copia
    from public.enrollments as e
    where e.op_enrollment_id = p_op_enrollment_id
      and e.user_id = conta
      and e.op_course_ref = chave_curso
    order by (e.hidden_at is null) desc, e.hidden_at desc
    limit 1;

    if copia is not null then
      update public.enrollments as e
         set course_title = titulo,
             teacher_name = left(coalesce(professor ->> 'display_name', ''), 160),
             modality = coalesce(turma ->> 'mode', ''),
             status = situacao,
             hidden_at = null,
             hidden_reason = null
       where e.id = copia;
      return;
    end if;

    -- 3. Nunca ocupa a chave de uma inscrição de outra origem.
    if exists (
      select 1 from public.enrollments as e
      where e.user_id = conta and e.course_ref = chave_curso
    ) then
      raise exception 'Já existe inscrição de outra origem para esta conta e curso.' using errcode = '23505';
    end if;

    insert into public.enrollments (
      user_id, course_ref, course_title, teacher_name, modality, status, op_enrollment_id, op_course_ref
    ) values (
      conta, chave_curso, titulo,
      left(coalesce(professor ->> 'display_name', ''), 160),
      coalesce(turma ->> 'mode', ''),
      situacao, p_op_enrollment_id, chave_curso
    );
  exception when others then
    insert into public.enrollment_projection_issues (op_enrollment_id, sqlstate, message)
    values (p_op_enrollment_id, sqlstate, left(sqlerrm, 500));
  end;
end;
$$;
revoke all on function public.op_projetar_inscricao(text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Gatilho em op_records
-- ---------------------------------------------------------------------
create or replace function public.op_records_projetar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo record;
begin
  if tg_op = 'DELETE' then
    if old.collection = 'enrollments' then
      perform public.op_projetar_inscricao(old.id, true);
    elsif old.collection = 'profiles' then
      -- Pessoa excluída: o vínculo sai e as cópias ficam ocultas (gatilho do vínculo).
      delete from public.op_profile_accounts as a where a.op_profile_id = old.id;
    elsif old.collection = 'activity_offerings' then
      for alvo in select r.id from public.op_records r
                  where r.collection = 'enrollments' and r.document ->> 'offering_id' = old.id loop
        perform public.op_projetar_inscricao(alvo.id);
      end loop;
    end if;
    return null;
  end if;

  if new.collection = 'enrollments' then
    perform public.op_projetar_inscricao(new.id);
  elsif tg_op = 'UPDATE' and new.collection = 'activity_offerings'
        and (old.document is distinct from new.document) then
    for alvo in select r.id from public.op_records r
                where r.collection = 'enrollments' and r.document ->> 'offering_id' = new.id loop
      perform public.op_projetar_inscricao(alvo.id);
    end loop;
  elsif tg_op = 'UPDATE' and new.collection = 'profiles'
        and (old.document ->> 'display_name') is distinct from (new.document ->> 'display_name') then
    -- Nome de professor aparece nas cópias das turmas que ele conduz.
    for alvo in select e.id from public.op_records e
                join public.op_records o on o.collection = 'activity_offerings'
                 and o.id = e.document ->> 'offering_id'
                where e.collection = 'enrollments' and o.document ->> 'professional_id' = new.id loop
      perform public.op_projetar_inscricao(alvo.id);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public.op_records_projetar() from public, anon, authenticated;

drop trigger if exists op_records_projetar on public.op_records;
create trigger op_records_projetar
  after insert or update or delete on public.op_records
  for each row execute function public.op_records_projetar();

-- ---------------------------------------------------------------------
-- Gatilho no vínculo
-- ---------------------------------------------------------------------
create or replace function public.op_profile_accounts_projetar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo record;
begin
  if tg_op = 'DELETE' then
    update public.enrollments as e
       set hidden_at = now(), hidden_reason = 'desvinculada'
     where e.user_id = old.user_id
       and e.op_enrollment_id is not null
       and e.hidden_at is null;
    return null;
  end if;

  for alvo in select r.id from public.op_records r
              where r.collection = 'enrollments' and r.document ->> 'profile_id' = new.op_profile_id loop
    perform public.op_projetar_inscricao(alvo.id);
  end loop;
  return null;
end;
$$;
revoke all on function public.op_profile_accounts_projetar() from public, anon, authenticated;

drop trigger if exists op_profile_accounts_projetar on public.op_profile_accounts;
create trigger op_profile_accounts_projetar
  after insert or delete on public.op_profile_accounts
  for each row execute function public.op_profile_accounts_projetar();

-- ---------------------------------------------------------------------
-- Divergências (somente leitura, só administração)
--
-- Compara o que o painel diz com o que o aluno vê. Uma linha por problema:
--   sem_copia        inscrição com vínculo, mas sem cópia visível
--   situacao         cópia visível com situação diferente da esperada
--   copia_indevida   cópia visível que deveria estar oculta
--   copia_orfa       cópia visível de inscrição que não existe mais no painel
--   falha_aberta     falha de projeção ainda não resolvida
-- Não devolve nome, e-mail nem dado de pedido.
-- ---------------------------------------------------------------------
create or replace function public.op_inscricoes_divergentes()
returns table (op_enrollment_id text, motivo text, detalhe text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'Somente a administração do Instituto consulta divergências.' using errcode = '42501';
  end if;

  return query
  with painel as (
    select r.id,
           r.document ->> 'status' as status,
           'op:' || (r.document ->> 'offering_id') as chave,
           a.user_id as conta,
           case r.document ->> 'status'
             when 'waitlist' then 'aguardando_turma'
             when 'active' then 'inscrito'
             when 'completed' then 'concluido'
           end as esperado
    from public.op_records as r
    left join public.op_profile_accounts as a on a.op_profile_id = r.document ->> 'profile_id'
    where r.collection = 'enrollments'
  ),
  visiveis as (
    select e.op_enrollment_id, e.user_id, e.op_course_ref, e.status
    from public.enrollments as e
    where e.op_enrollment_id is not null and e.hidden_at is null
  )
  select p.id, 'sem_copia'::text, p.esperado
  from painel p
  where p.conta is not null and p.esperado is not null
    and not exists (select 1 from visiveis v where v.op_enrollment_id = p.id and v.user_id = p.conta and v.op_course_ref = p.chave)
  union all
  select p.id, 'situacao', v.status || ' → ' || p.esperado
  from painel p join visiveis v on v.op_enrollment_id = p.id and v.user_id = p.conta and v.op_course_ref = p.chave
  where v.status is distinct from p.esperado
  union all
  select v.op_enrollment_id, 'copia_indevida', null
  from visiveis v join painel p on p.id = v.op_enrollment_id
  where p.conta is distinct from v.user_id or p.esperado is null or p.chave <> v.op_course_ref
  union all
  select v.op_enrollment_id, 'copia_orfa', null
  from visiveis v
  where not exists (select 1 from painel p where p.id = v.op_enrollment_id)
  union all
  select i.op_enrollment_id, 'falha_aberta', i.sqlstate || ': ' || i.message
  from public.enrollment_projection_issues as i
  where i.resolved_at is null;
end;
$$;
revoke all on function public.op_inscricoes_divergentes() from public, anon, authenticated;
grant execute on function public.op_inscricoes_divergentes() to authenticated;

-- ---------------------------------------------------------------------
-- Reconciliação (só administração; idempotente)
--
-- Reprojeta TODAS as inscrições do painel e oculta cópias órfãs. Entra na
-- mesma fila do op_apply (trava de op_meta), então não corre em paralelo com
-- uma gravação do painel. Falhas antigas são marcadas como resolvidas antes;
-- o que voltar a falhar gera um registro novo. Rodar duas vezes seguidas não
-- muda nada na segunda.
-- ---------------------------------------------------------------------
create or replace function public.op_reconciliar_inscricoes()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alvo record;
  reprojetadas integer := 0;
  orfas integer := 0;
  ultima_falha bigint;
  falhas_novas integer;
begin
  if not public.is_portal_admin() then
    raise exception 'Somente a administração do Instituto reconcilia inscrições.' using errcode = '42501';
  end if;

  perform 1 from public.op_meta as meta where meta.id = 1 for update;

  select coalesce(max(i.id), 0) into ultima_falha from public.enrollment_projection_issues as i;
  update public.enrollment_projection_issues as i
     set resolved_at = now()
   where i.resolved_at is null;

  for alvo in select r.id from public.op_records r where r.collection = 'enrollments' order by r.ordem loop
    perform public.op_projetar_inscricao(alvo.id);
    reprojetadas := reprojetadas + 1;
  end loop;

  for alvo in
    select distinct e.op_enrollment_id as id
    from public.enrollments as e
    where e.op_enrollment_id is not null and e.hidden_at is null
      and not exists (select 1 from public.op_records r where r.collection = 'enrollments' and r.id = e.op_enrollment_id)
  loop
    perform public.op_ocultar_copias(alvo.id, 'removida');
    orfas := orfas + 1;
  end loop;

  select count(*) into falhas_novas
  from public.enrollment_projection_issues as i
  where i.id > ultima_falha;

  return jsonb_build_object('reprojetadas', reprojetadas, 'orfas_ocultadas', orfas, 'falhas', falhas_novas);
end;
$$;
revoke all on function public.op_reconciliar_inscricoes() from public, anon, authenticated;
grant execute on function public.op_reconciliar_inscricoes() to authenticated;

commit;
