-- PROD-03: teste de comportamento das permissoes do Blog.
-- Uso: cole ANTES deste arquivo o corpo da migration 202611060005 (sem begin/commit) e execute tudo
-- numa unica transacao que termina em ROLLBACK (nada e gravado). O runner em
-- docs/prod-03-blog-permissoes.md monta isso. Cada verificacao falha com uma excecao nomeada.

create or replace function pg_temp.falha(q text, esperado text) returns void language plpgsql as $f$
begin
  execute q;
  raise exception 'FALTOU ERRO % EM: %', esperado, q;
exception when others then
  if sqlstate = esperado then return; end if;
  raise;
end $f$;

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

do $teste$
declare
  v_owner uuid; v_w uuid := gen_random_uuid(); v_e uuid := gen_random_uuid(); v_x uuid := gen_random_uuid();
  v_adm uuid := gen_random_uuid(); v_legado text; r jsonb; n int; admins_antes int;
begin
  reset role;
  select id into v_owner from public.users where role = 'owner' and active;
  select id into v_legado from public.blog_posts where created_by is null limit 1;
  select count(*) into admins_antes from public.users where role in ('owner', 'admin') and active;
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (v_w, 'w-test@example.invalid', 'authenticated', 'authenticated', '{}'),
    (v_e, 'e-test@example.invalid', 'authenticated', 'authenticated', '{}'),
    (v_x, 'x-test@example.invalid', 'authenticated', 'authenticated', '{}'),
    (v_adm, 'adm-test@example.invalid', 'authenticated', 'authenticated', '{}');
  insert into public.users (id, email, name, role, active) values (v_adm, 'adm-test@example.invalid', 'Adm', 'admin', true);

  -- Sem login e usuario comum nao concedem.
  reset role; set local role anon;
  perform pg_temp.falha(format('select public.admin_set_blog_access(%L, ''writer'')', v_w), '42501');
  perform pg_temp.como(v_x);
  perform pg_temp.falha(format('select public.admin_set_blog_access(%L, ''writer'')', v_w), '42501');
  perform pg_temp.falha('select public.admin_list_blog_events(5)', '42501');

  -- Owner concede, repete (idempotente), concede editor.
  perform pg_temp.como(v_owner);
  r := public.admin_set_blog_access(v_w, 'writer');
  perform pg_temp.exige('concede escritor', (r ->> 'changed')::boolean and r ->> 'level' = 'writer');
  r := public.admin_set_blog_access(v_w, 'writer');
  perform pg_temp.exige('repeticao nao muda', not (r ->> 'changed')::boolean);
  r := public.admin_set_blog_access(v_e, 'editor');
  perform pg_temp.exige('concede editor', r ->> 'level' = 'editor');
  reset role;
  select count(*) into n from public.admin_access_events where action = 'blog_access_changed' and target_user_id in (v_w, v_e);
  perform pg_temp.exige('auditoria so de mudancas reais (2)', n = 2);

  -- Nunca owner/admin, nem a si mesmo, nem nivel invalido.
  perform pg_temp.como(v_owner);
  perform pg_temp.falha(format('select public.admin_set_blog_access(%L, ''editor'')', v_adm), '42501');
  perform pg_temp.falha(format('select public.admin_set_blog_access(%L, ''editor'')', v_owner), '22023');
  perform pg_temp.falha(format('select public.admin_set_blog_access(%L, ''owner'')', v_w), '22023');
  perform pg_temp.falha(format('select public.admin_set_blog_access(%L, ''editor'')', gen_random_uuid()), '22023');
  perform pg_temp.exige('historico visivel ao owner', jsonb_array_length(public.admin_list_blog_events(10)) >= 2);

  -- Escritor: cria e edita o proprio, nao publica, nao toca em alheio.
  perform pg_temp.como(v_w);
  r := public.mesa_salvar_post(jsonb_build_object('id', 'zz-w1', 'slug', 'zz-w1', 'title', 'Meu'), 'rascunho');
  perform pg_temp.exige('escritor cria rascunho', r ->> 'status' = 'draft' and r ->> 'created_by' = v_w::text);
  r := public.mesa_salvar_post(jsonb_build_object('id', 'zz-w1', 'slug', 'zz-w1', 'title', 'Meu 2'), 'rascunho');
  perform pg_temp.exige('escritor edita o proprio', r -> 'document' ->> 'title' = 'Meu 2');
  r := public.mesa_salvar_post(jsonb_build_object('id', 'zz-w1', 'slug', 'zz-w1', 'title', 'Meu 2'), 'revisao');
  perform pg_temp.exige('escritor envia para revisao', r ->> 'status' = 'review');
  perform pg_temp.falha($q$select public.mesa_salvar_post('{"id":"zz-w1","slug":"zz-w1","title":"x"}', 'publicar')$q$, '42501');
  perform pg_temp.falha($q$select public.mesa_salvar_post('{"id":"zz-w1","slug":"zz-w1","title":"x"}', 'agendar', now() + interval '1 day')$q$, '42501');
  perform pg_temp.falha($q$select public.mesa_salvar_post('{"id":"zz-w1","slug":"zz-w1","title":"x"}', 'arquivar')$q$, '42501');
  perform pg_temp.falha($q$select public.mesa_salvar_post('{"id":"zz-w2","slug":"zz-w2","title":"x","featured":true}', 'rascunho')$q$, '42501');
  -- status forjado no documento nao publica
  r := public.mesa_salvar_post('{"id":"zz-w3","slug":"zz-w3","title":"x","status":"published"}', 'rascunho');
  perform pg_temp.exige('status forjado e ignorado', r ->> 'status' = 'draft');
  if v_legado is not null then
    perform pg_temp.falha(format($q$select public.mesa_salvar_post(jsonb_build_object('id', %L, 'slug', 'x', 'title', 'x'), 'rascunho')$q$, v_legado), '42501');
  end if;

  -- Editor publica/despublica e edita de outro autor; escritor nao ve rascunho alheio.
  perform pg_temp.como(v_e);
  r := public.mesa_salvar_post(jsonb_build_object('id', 'zz-e1', 'slug', 'zz-e1', 'title', 'Do editor'), 'rascunho');
  r := public.mesa_salvar_post(jsonb_build_object('id', 'zz-w1', 'slug', 'zz-w1', 'title', 'Revisado'), 'publicar');
  perform pg_temp.exige('editor publica texto alheio', r ->> 'status' = 'published' and r ->> 'created_by' = v_w::text);
  r := public.mesa_salvar_post(jsonb_build_object('id', 'zz-w1', 'slug', 'zz-w1', 'title', 'Revisado'), 'despublicar');
  perform pg_temp.exige('editor despublica', r ->> 'status' = 'draft');
  perform pg_temp.exige('editor nao e admin', not public.is_portal_admin());
  perform pg_temp.falha('select public.admin_list_accounts()', '42501');
  perform pg_temp.falha(format('select public.admin_set_blog_access(%L, ''none'')', v_w), '42501');
  perform pg_temp.exige('editor lista tudo', jsonb_array_length(public.mesa_listar_posts()) >= 3);

  perform pg_temp.como(v_w);
  perform pg_temp.exige('escritor nao ve rascunho alheio', not exists (
    select 1 from jsonb_array_elements(public.mesa_listar_posts()) p where p ->> 'id' = 'zz-e1'));
  perform pg_temp.exige('escritor ve o proprio', exists (
    select 1 from jsonb_array_elements(public.mesa_listar_posts()) p where p ->> 'id' = 'zz-w1'));

  -- Acesso direto a API: sem escrita em tabelas, sem leitura de rascunhos.
  perform pg_temp.falha($q$update public.blog_posts set status = 'published' where id = 'zz-w1'$q$, '42501');
  perform pg_temp.falha($q$insert into public.blog_posts (id, slug, status, document) values ('zz-d','zz-d','published','{}')$q$, '42501');
  perform pg_temp.falha($q$insert into public.portal_module_permissions (user_id, module, can_publish) values (gen_random_uuid(), 'blog', true)$q$, '42501');
  perform pg_temp.falha($q$update public.users set role = 'owner' where true$q$, '42501');
  select count(*) into n from public.blog_posts where status = 'draft' or status = 'review';
  perform pg_temp.exige('select direto nao expoe rascunhos', n = 0);
  select count(*) into n from public.blog_post_versions where autor_id is distinct from v_w;
  perform pg_temp.exige('versoes alheias ocultas ao escritor', n = 0);
  perform pg_temp.falha('select count(*) from public.op_records', '42501');
  perform pg_temp.falha('select public.admin_list_professional_profiles()', '42501');

  -- Sem permissao.
  perform pg_temp.como(v_x);
  perform pg_temp.falha($q$select public.mesa_salvar_post('{"id":"zz-x","slug":"zz-x","title":"x"}', 'rascunho')$q$, '42501');
  perform pg_temp.falha('select public.mesa_listar_posts()', '42501');

  -- Revogacao vale na proxima chamada (mesma "sessao").
  perform pg_temp.como(v_owner);
  r := public.admin_set_blog_access(v_w, 'none');
  perform pg_temp.exige('revoga', (r ->> 'changed')::boolean and r ->> 'level' = 'none');
  r := public.admin_set_blog_access(v_w, 'none');
  perform pg_temp.exige('revogar de novo nao muda', not (r ->> 'changed')::boolean);
  perform pg_temp.como(v_w);
  perform pg_temp.falha($q$select public.mesa_salvar_post('{"id":"zz-w1","slug":"zz-w1","title":"depois"}', 'rascunho')$q$, '42501');
  perform pg_temp.falha('select public.mesa_listar_posts()', '42501');

  -- Regrant reativa; contas administrativas intactas.
  perform pg_temp.como(v_owner);
  r := public.admin_set_blog_access(v_w, 'writer');
  perform pg_temp.exige('regrant', r ->> 'level' = 'writer');
  reset role;
  select count(*) into n from public.admin_access_events where action = 'blog_access_changed' and target_user_id = v_w;
  perform pg_temp.exige('auditoria: grant, revoke, regrant = 3', n = 3);
  select count(*) into n from public.users where role in ('owner', 'admin') and active and id <> v_adm;
  perform pg_temp.exige('uma unica conta administrativa real', n = admins_antes);
  perform pg_temp.exige('nenhum blog_editor virou admin', not exists (select 1 from public.users where id in (v_w, v_e, v_x) and role <> 'blog_editor'));
end
$teste$;

select 'PASSOU' as resultado;
