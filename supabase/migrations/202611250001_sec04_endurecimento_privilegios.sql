-- SEC-04: endurecimento minimo de dois privilegios. SOMENTE REVOKE; esta migration nao concede nada.
--
--   1) public.is_portal_admin(): remove EXECUTE de anon.
--      No Supabase, funcao nova em public nasce com EXECUTE explicito para anon, authenticated e service_role
--      (privilegio padrao). As migrations 202609020001 e 202609080004 revogaram so de PUBLIC, o que nao remove o
--      grant explicito de anon (mesmo mecanismo ja documentado em 202609170004). A funcao devolve false sem
--      sessao, entao nao ha vazamento; o objetivo e nao deixar a funcao administrativa alcancavel pela chave
--      publicavel. Conferido na producao em 25/11/2026: nenhuma politica aplicavel a anon/PUBLIC, nenhuma funcao
--      executavel por anon e nenhuma view/constraint dependem dela; o frontend nao a chama por RPC.
--
--   2) public.home_block_drafts: remove MAINTAIN de authenticated (PostgreSQL 17+).
--      MAINTAIN (VACUUM, ANALYZE, REINDEX, CLUSTER, REFRESH MATERIALIZED VIEW, LOCK TABLE) nasceu no PostgreSQL 17 e
--      o privilegio padrao ALL passou a inclui-lo. A migration 202609170004 revogou truncate/references/trigger
--      desta tabela, mas MAINTAIN ainda nao existia. Era a unica tabela de public com MAINTAIN (1 de 46).
--      Em PostgreSQL anterior ao 17 o privilegio nao existe: nada a fazer.
--
-- Preservados (a migration aborta se authenticated nao os tiver, em vez de concede-los; o estado de service_role nao muda): EXECUTE de authenticated e
-- service_role em is_portal_admin(); SELECT, INSERT, UPDATE e DELETE de authenticated em home_block_drafts.
-- Nao altera corpo de funcao, politica RLS, RPC, usuario ou permissao de outro objeto. Nenhum dado e alterado.
-- Idempotente. Qualquer pre ou pos-condicao violada levanta excecao e desfaz a transacao inteira.
-- Execute como postgres (SQL Editor do Supabase): o REVOKE so remove concessoes feitas pelo dono do objeto.
-- Reversao: supabase/rollbacks/202611250001_rollback_sec04_endurecimento_privilegios.sql
begin;

-- 1) public.is_portal_admin(): anon sem EXECUTE.
do $$
declare
  fn constant oid := to_regprocedure('public.is_portal_admin()')::oid;
  tem_service_role constant boolean := exists (select 1 from pg_roles where rolname = 'service_role');
  svc_antes boolean;
begin
  -- Pre-condicoes.
  if fn is null then
    raise exception 'sec04[is_portal_admin]: public.is_portal_admin() nao existe';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'sec04[is_portal_admin]: papeis anon/authenticated ausentes';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = fn and p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
  ) then
    raise exception 'sec04[is_portal_admin]: funcao nao e SECURITY DEFINER com search_path fixo (estado inesperado)';
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'sec04[is_portal_admin]: authenticated sem EXECUTE; esta migration nao concede privilegios';
  end if;
  -- service_role: a migration nao concede nem exige; so garante que o estado atual (com ou sem EXECUTE) nao muda.
  svc_antes := tem_service_role and has_function_privilege('service_role', fn, 'execute');

  -- Acao: so remocao. PUBLIC entra na lista para que nao reste concessao herdada por esse caminho.
  revoke all on function public.is_portal_admin() from public, anon;

  -- Pos-condicoes: concessao DIRETA (entrada na ACL) e EFETIVA (inclui PUBLIC e heranca de papel).
  if exists (
    select 1
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = fn and a.privilege_type = 'EXECUTE'
      and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'))
  ) then
    raise exception 'sec04[is_portal_admin]: a ACL ainda tem EXECUTE direto para anon ou PUBLIC';
  end if;
  if has_function_privilege('anon', fn, 'execute') then
    raise exception 'sec04[is_portal_admin]: anon ainda executa por heranca (papel pai)';
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'sec04[is_portal_admin]: authenticated perdeu EXECUTE';
  end if;
  if svc_antes and not has_function_privilege('service_role', fn, 'execute') then
    raise exception 'sec04[is_portal_admin]: service_role perdeu EXECUTE';
  end if;
end;
$$;

-- 2) public.home_block_drafts: authenticated sem MAINTAIN.
do $$
declare
  tbl constant oid := to_regclass('public.home_block_drafts')::oid;
  priv text;
begin
  -- Pre-condicoes.
  if tbl is null then
    raise exception 'sec04[home_block_drafts]: public.home_block_drafts nao existe';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'sec04[home_block_drafts]: papel authenticated ausente';
  end if;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', tbl, priv) then
      raise exception 'sec04[home_block_drafts]: authenticated sem % ; esta migration nao concede privilegios', priv;
    end if;
  end loop;

  if current_setting('server_version_num')::int >= 170000 then
    -- Acao (EXECUTE dinamico: em PostgreSQL < 17 o comando nao e reconhecido e nunca chega a ser executado).
    execute 'revoke maintain on table public.home_block_drafts from authenticated';

    -- Pos-condicoes: direta (ACL) e efetiva (PUBLIC ou papel pai).
    if exists (
      select 1
      from pg_class c, aclexplode(c.relacl) a
      where c.oid = tbl and a.privilege_type = 'MAINTAIN'
        and a.grantee = (select oid from pg_roles where rolname = 'authenticated')
    ) then
      raise exception 'sec04[home_block_drafts]: a ACL ainda tem MAINTAIN direto para authenticated';
    end if;
    if has_table_privilege('authenticated', tbl, 'MAINTAIN') then
      raise exception 'sec04[home_block_drafts]: authenticated ainda tem MAINTAIN por heranca (PUBLIC ou papel pai)';
    end if;
  else
    raise notice 'sec04[home_block_drafts]: PostgreSQL < 17, MAINTAIN nao existe; nada a revogar';
  end if;

  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', tbl, priv) then
      raise exception 'sec04[home_block_drafts]: authenticated perdeu %', priv;
    end if;
  end loop;
end;
$$;

commit;
