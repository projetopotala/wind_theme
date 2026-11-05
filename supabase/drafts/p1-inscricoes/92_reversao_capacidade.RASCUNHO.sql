-- =====================================================================
-- RASCUNHO — NÃO APLICAR. Reversão da proteção de capacidade das turmas.
-- Exige `set potala.p1_aprovado = 'reverter-capacidade'`.
-- Não altera nenhum dado: só remove o gatilho e as funções. A partir daí,
-- a capacidade volta a ser verificada apenas no navegador do painel.
-- =====================================================================

do $trava$
begin
  if coalesce(current_setting('potala.p1_aprovado', true), '') <> 'reverter-capacidade' then
    raise exception 'RASCUNHO (reversão da capacidade): não autorizado nesta sessão.';
  end if;
end;
$trava$;

begin;

drop trigger if exists op_records_capacidade on public.op_records;
drop function if exists public.op_records_capacidade();
drop function if exists public.op_capacidade_verificar_turma(text);

commit;
