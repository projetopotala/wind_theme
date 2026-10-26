-- =====================================================================
-- RASCUNHO — NÃO APLICAR. Reversão da PARTE 2 (projeção).
-- Exige `set potala.p1_aprovado = 'reverter-projecao'`.
--
-- Desliga a cópia automática. NÃO apaga nenhuma linha de public.enrollments
-- nem de course_progress: as cópias já feitas continuam como estão (visíveis
-- ou ocultas). Para esconder do aluno todas as cópias vindas do painel sem
-- apagar nada, há um bloco opcional ao final, comentado.
-- =====================================================================

do $trava$
begin
  if coalesce(current_setting('potala.p1_aprovado', true), '') <> 'reverter-projecao' then
    raise exception 'RASCUNHO P1 (reversão da projeção): não autorizado nesta sessão.';
  end if;
end;
$trava$;

begin;

drop trigger if exists op_profile_accounts_projetar on public.op_profile_accounts;
drop trigger if exists op_records_projetar on public.op_records;
drop function if exists public.op_profile_accounts_projetar();
drop function if exists public.op_records_projetar();
drop function if exists public.op_projetar_inscricao(text, boolean);
drop function if exists public.op_ocultar_copias(text, text, uuid);
-- O registro de falhas fica (é histórico). Para removê-lo depois de lido:
-- drop table if exists public.enrollment_projection_issues;

-- Opcional: ocultar do aluno todas as cópias do painel, sem apagar.
-- update public.enrollments
--    set hidden_at = now(), hidden_reason = 'desvinculada'
--  where op_enrollment_id is not null and hidden_at is null;

commit;
