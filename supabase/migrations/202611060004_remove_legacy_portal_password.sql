-- PROD-02: remove a autenticação legada por senha própria do portal.
--
-- O login e a recuperação de senha acontecem exclusivamente pelo Supabase Auth. As duas
-- funções abaixo e a coluna public.users.password_hash são uma segunda credencial sem uso:
-- nenhuma tela, RPC, Edge Function, trigger, view, política ou script ativo as referencia.
-- O acesso de service_role às funções já foi revogado; hoje só o dono do banco as executa.
--
-- ATENÇÃO (irreversível para os dados): reverter o esquema recria a coluna vazia, mas não
-- devolve o hash descartado. Antes de aplicar, exporte public.users (id, password_hash)
-- para um arquivo privado fora do repositório (ver docs/prod-02-limpeza-seguranca.md).
-- Esta migration NÃO foi aplicada no banco oficial; a aplicação exige autorização.
--
-- A migration antiga 202609180001 também removia estes objetos, mas nunca entrou no
-- histórico remoto e mistura outras alterações; por isso esta é uma migration nova e mínima.

begin;

do $guard$
declare
  v_outras text;
begin
  -- Aborta se algum outro objeto de função passou a depender dos itens legados.
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_outras
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.proname not in ('set_portal_user_password', 'verify_portal_password')
    and (
      p.prosrc ilike '%password_hash%'
      or p.prosrc ilike '%set_portal_user_password%'
      or p.prosrc ilike '%verify_portal_password%'
    );
  if v_outras is not null then
    raise exception 'dependencias legadas encontradas: %', v_outras using errcode = '2BP01';
  end if;
end
$guard$;

drop function if exists public.verify_portal_password(text, text);
drop function if exists public.set_portal_user_password(text, text);

alter table public.users
  drop column if exists password_hash;

commit;
