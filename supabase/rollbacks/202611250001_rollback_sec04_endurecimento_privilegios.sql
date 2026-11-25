-- Reverte somente a migration 202611250001 (SEC-04): devolve os DOIS privilegios removidos e nada alem deles.
--   1) EXECUTE de anon em public.is_portal_admin().
--   2) MAINTAIN de authenticated em public.home_block_drafts (PostgreSQL 17+).
-- ATENCAO: reabre a exposicao que a SEC-04 fechou. Use somente diante de regressao comprovada; NAO e executado
-- automaticamente por nenhum fluxo. Nao toca nos demais grants, em corpo de funcao, politica, RPC ou dado.
-- Idempotente. Execute como postgres (SQL Editor do Supabase), o mesmo papel que concedeu os privilegios originais:
-- assim a ACL volta identica (anon=X/postgres e authenticated=arwdm/postgres).
begin;

do $$
declare
  fn constant oid := to_regprocedure('public.is_portal_admin()')::oid;
  tbl constant oid := to_regclass('public.home_block_drafts')::oid;
  tem_service_role constant boolean := exists (select 1 from pg_roles where rolname = 'service_role');
  priv text;
begin
  -- Pre-condicoes: objetos e papeis existem e os privilegios que NAO serao mexidos estao presentes.
  if fn is null then
    raise exception 'sec04-rollback: public.is_portal_admin() nao existe';
  end if;
  if tbl is null then
    raise exception 'sec04-rollback: public.home_block_drafts nao existe';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'sec04-rollback: papeis anon/authenticated ausentes';
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'sec04-rollback: authenticated sem EXECUTE em is_portal_admin(); estado inesperado, nada foi alterado';
  end if;
  if tem_service_role and not has_function_privilege('service_role', fn, 'execute') then
    raise exception 'sec04-rollback: service_role sem EXECUTE em is_portal_admin(); estado inesperado, nada foi alterado';
  end if;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', tbl, priv) then
      raise exception 'sec04-rollback: authenticated sem % em home_block_drafts; estado inesperado, nada foi alterado', priv;
    end if;
  end loop;

  -- Acao: restaura apenas os dois privilegios removidos.
  execute 'grant execute on function public.is_portal_admin() to anon';
  if current_setting('server_version_num')::int >= 170000 then
    execute 'grant maintain on table public.home_block_drafts to authenticated';
  else
    raise notice 'sec04-rollback: PostgreSQL < 17, MAINTAIN nao existe; nada a restaurar';
  end if;

  -- Pos-condicoes.
  if not has_function_privilege('anon', fn, 'execute') then
    raise exception 'sec04-rollback: anon nao recuperou EXECUTE em is_portal_admin()';
  end if;
  if current_setting('server_version_num')::int >= 170000
     and not has_table_privilege('authenticated', tbl, 'MAINTAIN') then
    raise exception 'sec04-rollback: authenticated nao recuperou MAINTAIN em home_block_drafts';
  end if;
  if not has_function_privilege('authenticated', fn, 'execute')
     or (tem_service_role and not has_function_privilege('service_role', fn, 'execute')) then
    raise exception 'sec04-rollback: EXECUTE de authenticated/service_role foi alterado';
  end if;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', tbl, priv) then
      raise exception 'sec04-rollback: authenticated perdeu % em home_block_drafts', priv;
    end if;
  end loop;
end;
$$;

commit;
