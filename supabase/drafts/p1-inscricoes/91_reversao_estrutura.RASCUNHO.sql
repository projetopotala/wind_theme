-- =====================================================================
-- RASCUNHO — NÃO APLICAR. Reversão da PARTE 1 (estrutura).
-- Exige `set potala.p1_aprovado = 'reverter-estrutura'` e a PARTE 2 já
-- revertida (90_reversao_projecao).
--
-- RECUSA-SE a rodar se houver qualquer dado que a reversão faria perder ou
-- reaparecer indevidamente:
--   * cópias do painel em public.enrollments (visíveis ou ocultas);
--   * linhas ocultas de qualquer origem (voltariam a aparecer ao aluno);
--   * vínculos em op_profile_accounts;
--   * pedidos identificados em site_interests (a coluna user_id seria perdida).
-- Nesses casos, a decisão sobre esses dados vem antes, por escrito.
-- =====================================================================

do $trava$
begin
  if coalesce(current_setting('potala.p1_aprovado', true), '') <> 'reverter-estrutura' then
    raise exception 'RASCUNHO P1 (reversão da estrutura): não autorizado nesta sessão.';
  end if;
end;
$trava$;

begin;

do $seguranca$
begin
  if to_regprocedure('public.op_projetar_inscricao(text,boolean)') is not null then
    raise exception 'Reverta a PARTE 2 antes (90_reversao_projecao).';
  end if;
  if exists (select 1 from public.enrollments where op_enrollment_id is not null or hidden_at is not null) then
    raise exception 'Há inscrições vindas do painel ou ocultas: decidir o destino delas antes de reverter.';
  end if;
  if to_regclass('public.op_profile_accounts') is not null
     and exists (select 1 from public.op_profile_accounts) then
    raise exception 'Há vínculos de conta registrados: decidir o destino deles antes de reverter.';
  end if;
  if exists (select 1 from public.site_interests where user_id is not null) then
    raise exception 'Há pedidos identificados: a reversão apagaria a identificação deles.';
  end if;
end;
$seguranca$;

drop index if exists public.op_records_enrollment_pessoa_turma;

drop trigger if exists op_profile_accounts_validar on public.op_profile_accounts;
drop function if exists public.op_profile_accounts_validar();
drop table if exists public.op_profile_accounts;

drop policy if exists "visitante le o proprio progresso" on public.course_progress;
create policy "visitante le o proprio progresso" on public.course_progress
  for select to authenticated
  using (exists (
    select 1
    from public.enrollments
    where enrollments.id = course_progress.enrollment_id
      and enrollments.user_id = (select auth.uid())
  ));

drop policy if exists "visitante le as proprias inscricoes" on public.enrollments;
create policy "visitante le as proprias inscricoes" on public.enrollments
  for select to authenticated using ((select auth.uid()) = user_id);

drop index if exists public.enrollments_op_visivel_unica;
alter table public.enrollments drop constraint if exists enrollments_ocultacao_consistente;
alter table public.enrollments drop constraint if exists enrollments_origem_do_painel_consistente;
alter table public.enrollments
  drop column if exists hidden_reason,
  drop column if exists hidden_at,
  drop column if exists op_course_ref,
  drop column if exists op_enrollment_id;

drop policy if exists "visitante envia interesse" on public.site_interests;
create policy "visitante envia interesse" on public.site_interests
  for insert to anon, authenticated
  with check (kind in ('curso', 'experiencia-cultural', 'retorno-recepcao'));
drop trigger if exists site_interests_identidade_da_sessao on public.site_interests;
drop function if exists public.site_interests_identidade_da_sessao();
drop index if exists public.site_interests_user_idx;
alter table public.site_interests drop column if exists user_id;

commit;
