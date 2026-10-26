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
--   * cancelada / removida / trocada / reatribuída / desvinculada → oculta;
--   * reinscrição ou nova ligação → reexibe a MESMA linha (progresso volta);
--   * falha inesperada na cópia NÃO desfaz a operação do painel: fica
--     registrada em public.enrollment_projection_issues para a administração.
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
      where table_schema = 'public' and table_name = 'enrollments' and column_name = 'hidden_at'
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
  occurred_at timestamptz not null default now()
);
alter table public.enrollment_projection_issues enable row level security;
revoke all on table public.enrollment_projection_issues from public, anon, authenticated;
grant select on table public.enrollment_projection_issues to authenticated;
drop policy if exists "administracao le falhas de projecao" on public.enrollment_projection_issues;
create policy "administracao le falhas de projecao" on public.enrollment_projection_issues
  for select to authenticated using ((select public.is_portal_admin()));

-- ---------------------------------------------------------------------
-- Oculta as cópias visíveis de uma inscrição (sem apagar)
-- ---------------------------------------------------------------------
create or replace function public.op_ocultar_copias(p_op_enrollment_id text, p_motivo text, p_exceto uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.enrollments as e
     set hidden_at = now(), hidden_reason = p_motivo
   where e.op_enrollment_id = p_op_enrollment_id
     and e.hidden_at is null
     and (p_exceto is null or e.id <> p_exceto);
$$;
revoke all on function public.op_ocultar_copias(text, text, uuid) from public, anon, authenticated;

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

    -- Cópias visíveis desta inscrição em OUTRA conta ou OUTRA turma ficam
    -- ocultas (com o progresso preservado) antes de exibir a nova.
    update public.enrollments as e
       set hidden_at = now(),
           hidden_reason = case when e.user_id <> conta then 'reatribuida' else 'trocada' end
     where e.op_enrollment_id = p_op_enrollment_id
       and e.hidden_at is null
       and (e.user_id <> conta or e.course_ref <> chave_curso);

    insert into public.enrollments as e (
      user_id, course_ref, course_title, teacher_name, modality, status,
      op_enrollment_id, hidden_at, hidden_reason
    ) values (
      conta, chave_curso, titulo,
      left(coalesce(professor ->> 'display_name', ''), 160),
      coalesce(turma ->> 'mode', ''),
      situacao, p_op_enrollment_id, null, null
    )
    on conflict (user_id, course_ref) do update set
      course_title = excluded.course_title,
      teacher_name = excluded.teacher_name,
      modality = excluded.modality,
      status = excluded.status,
      op_enrollment_id = excluded.op_enrollment_id,
      hidden_at = null,
      hidden_reason = null
    -- Nunca sobrescreve uma inscrição que não veio do painel.
    where e.op_enrollment_id is not null
    returning e.id into copia;

    if copia is null then
      raise exception 'Já existe inscrição de outra origem para esta conta e curso.' using errcode = '23505';
    end if;
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

commit;
