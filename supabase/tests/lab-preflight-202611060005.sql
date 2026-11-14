-- PREFLIGHT DA MIGRATION 202611060005 (blog_editorial_permissions) NO LAB hmspabllgxqfzzricijv.
-- SOMENTE LEITURA: só SELECT. Não altera nada, não lista e-mails nem dados pessoais.
-- Rode no SQL Editor do LAB (ou por uma conexão de leitura) e anexe o resultado ao registro da homologação.
-- NUNCA rode contra a Produção (gotrumwuimpoeggwamut).

-- 0. Confirma que está no LAB (o resultado precisa ser o projeto do LAB, não o de produção).
select current_database() as banco, current_setting('server_version') as versao_postgres;

-- 1. Histórico de migrations (a fonte de verdade do que está aplicado).
select version, name
from supabase_migrations.schema_migrations
where version >= '202610280001'
order by version;

-- 2. Dependências que a 202611060005 exige. Todas as linhas devem vir com existe = true
--    ANTES de aplicar. admin_access_events é criada pela 202611060003.
select dependencia, existe from (values
  ('tabela public.users',                      to_regclass('public.users') is not null),
  ('tabela public.portal_module_permissions',  to_regclass('public.portal_module_permissions') is not null),
  ('tabela public.admin_access_events',        to_regclass('public.admin_access_events') is not null),
  ('tabela public.blog_posts',                 to_regclass('public.blog_posts') is not null),
  ('tabela public.blog_post_versions',         to_regclass('public.blog_post_versions') is not null),
  ('tabela public.blog_categories',            to_regclass('public.blog_categories') is not null),
  ('função public.has_portal_permission',      to_regprocedure('public.has_portal_permission(text,text)') is not null),
  ('função public.mesa_listar_posts',          to_regprocedure('public.mesa_listar_posts()') is not null),
  ('função public.mesa_salvar_post',           to_regprocedure('public.mesa_salvar_post(jsonb,text,timestamptz,boolean,text)') is not null),
  ('função public.mesa_post_json',             to_regprocedure('public.mesa_post_json(public.blog_posts)') is not null),
  ('bucket blog-midia',                        exists (select 1 from storage.buckets where id = 'blog-midia'))
) as t(dependencia, existe);

-- 3. Objetos que a migration cria: devem estar AUSENTES (existe = false) antes; presentes depois.
select objeto, existe from (values
  ('função public.blog_access_level',          to_regprocedure('public.blog_access_level(uuid)') is not null),
  ('função public.admin_set_blog_access',      to_regprocedure('public.admin_set_blog_access(uuid,text)') is not null),
  ('função public.admin_list_blog_events',     to_regprocedure('public.admin_list_blog_events(integer)') is not null),
  ('coluna blog_posts.created_by',             exists (select 1 from information_schema.columns where table_schema='public' and table_name='blog_posts' and column_name='created_by'))
) as t(objeto, existe);

-- 4. Compatibilidade de constraints: o papel 'blog_editor' precisa ser aceito em public.users
--    e a ação 'blog_access_changed' será acrescentada à lista de admin_access_events.
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid in ('public.users'::regclass)
  and contype = 'c';
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = to_regclass('public.admin_access_events') and contype = 'c';

-- 5. Impacto: quantos registros existem hoje (só contagens; nenhum dado pessoal).
select 'blog_posts por status' as medida, status, count(*) from public.blog_posts group by status
union all select 'public.users por papel', role, count(*) from public.users group by role
union all select 'portal_module_permissions blog ativas', module, count(*) from public.portal_module_permissions where active group by module;
-- created_by ficará nulo nos textos existentes: só editor/owner poderão alterá-los (efeito desejado).

-- 6. Estado atual das políticas que a migration substitui (guarde a saída: é o seu rollback).
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('blog_post_versions', 'blog_categories'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname in ('mesa troca midia do blog', 'mesa remove midia do blog'))
order by schemaname, tablename, policyname;

-- 7. Definições atuais das funções que serão substituídas (guarde a saída: é o seu rollback).
select p.proname, pg_get_functiondef(p.oid) as definicao
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('mesa_listar_posts', 'mesa_salvar_post', 'mesa_post_json')
order by p.proname;

-- 8. Permissões de execução atuais (a migration revoga de anon e concede a authenticated).
select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'execute') as pode_executar
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join (select oid, rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where n.nspname = 'public' and p.proname in ('mesa_listar_posts', 'mesa_salvar_post')
order by p.proname, r.rolname;

-- 9. Triggers em blog_posts (a validação de conteúdo da 202611100001 não é dependência, mas muda o comportamento do salvar).
select tgname, pg_get_triggerdef(oid) as definicao
from pg_trigger
where tgrelid = 'public.blog_posts'::regclass and not tgisinternal;
