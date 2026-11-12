-- REVERSÃO DA P1D (202611120001_integridade_inscricoes.sql).
--
-- Remove só o que a P1D criou: três gatilhos, três funções e um índice.
-- Não toca em nenhum registro: inscrições, turmas, pessoas e auditoria ficam
-- exatamente como estão. Depois da reversão, o banco volta a aceitar
-- inscrições sem as regras de capacidade, unicidade, referência, situação e
-- escopo (as regras continuam no motor do painel).
--
-- Uso: somente com autorização, pelo procedimento controlado de Production
-- (sem db push em lote; issue #52). Depois, registrar a reversão no histórico.

begin;

drop trigger if exists op_records_validate_scope on public.op_records;
drop trigger if exists op_records_protect_enrollment_refs on public.op_records;
drop trigger if exists op_records_validate_enrollment on public.op_records;

drop function if exists public.validate_op_scope();
drop function if exists public.validate_op_enrollment();
drop function if exists public.op_turma_capacidade(jsonb);

drop index if exists public.op_records_enrollment_pessoa_turma;

do $verificacao$
begin
  if exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.op_records'::regclass
              and tgname in ('op_records_validate_scope', 'op_records_protect_enrollment_refs', 'op_records_validate_enrollment'))
     or to_regclass('public.op_records_enrollment_pessoa_turma') is not null then
    raise exception 'Reversão da P1D incompleta.';
  end if;
  -- As guardas anteriores à P1D continuam ativas.
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.op_records'::regclass and tgname = 'op_records_validate_before_write') then
    raise exception 'A guarda operacional anterior não está ativa; verifique antes de prosseguir.';
  end if;
end;
$verificacao$;

commit;
