-- PROD-03: o rollback incremental preserva os dados produzidos depois da aplicacao.
-- Uso: begin; <migration 0005 sem begin/commit>; <este arquivo, com o rollback sem begin/commit no
-- lugar do marcador abaixo>; rollback;  (o runner esta em docs/prod-03-blog-permissoes.md)

create or replace function pg_temp.como(uid uuid) returns void language plpgsql as $f$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $f$;

create or replace function pg_temp.exige(nome text, cond boolean) returns void language plpgsql as $f$
begin
  if cond is not true then raise exception 'VERIFICACAO FALHOU: %', nome; end if;
end $f$;

do $antes$
declare v_owner uuid; v_w uuid := gen_random_uuid();
begin
  reset role;
  select id into v_owner from public.users where role = 'owner' and active;
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (v_w, 'rb-test@example.invalid', 'authenticated', 'authenticated', '{}');
  perform set_config('app.rb_w', v_w::text, true);
  perform pg_temp.como(v_owner);
  perform public.admin_set_blog_access(v_w, 'writer');
  perform pg_temp.como(v_w);
  perform public.mesa_salvar_post('{"id":"zz-rb","slug":"zz-rb","title":"x"}', 'rascunho');
  reset role;
end
$antes$;

-- @@ROLLBACK@@

do $depois$
declare v_w uuid := current_setting('app.rb_w')::uuid;
begin
  reset role;
  perform pg_temp.exige('autoria preservada', (select created_by = v_w from public.blog_posts where id = 'zz-rb'));
  perform pg_temp.exige('auditoria preservada', (select count(*) from public.admin_access_events
    where action = 'blog_access_changed' and target_user_id = v_w) = 1);
  perform pg_temp.exige('concessao preservada', public.blog_access_level(v_w) = 'writer');
  perform pg_temp.exige('mesa_salvar_post voltou ao anterior', (select prosrc not like '%v_publica%'
    from pg_proc where oid = 'public.mesa_salvar_post(jsonb,text,timestamptz,boolean,text)'::regprocedure));
  perform pg_temp.exige('politica de midia voltou ao anterior', (select count(*) from pg_policies
    where schemaname = 'storage' and policyname = 'mesa remove midia do blog' and qual like '%owner_id%') = 0);
  perform pg_temp.exige('politica de categorias voltou ao anterior', (select count(*) from pg_policies
    where tablename = 'blog_categories' and policyname = 'administracao apaga categorias' and qual like '%publish%') = 0);
  perform pg_temp.exige('funcao do owner segue existindo', to_regprocedure('public.admin_set_blog_access(uuid,text)') is not null);
  perform pg_temp.como(v_w);
  perform pg_temp.exige('escritor ainda salva o proprio texto', (public.mesa_salvar_post('{"id":"zz-rb","slug":"zz-rb","title":"y"}', 'rascunho') ->> 'status') = 'draft');
end
$depois$;

select 'ROLLBACK_OK' as resultado;
