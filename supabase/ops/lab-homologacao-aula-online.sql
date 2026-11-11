-- OPERACAO MANUAL, SOMENTE LAB (hmspabllgxqfzzricijv). NAO e migration: nunca rodar em producao.
-- Homologacao do link da aula online em public.my_course_enrollments() (migration 202611110002).
-- Dados 100% sinteticos (@example.invalid) dentro de UM bloco que termina em erro proposital
-- => rollback total, nada persiste.
--
-- Como usar (SQL Editor do projeto LAB; confira a URL: .../project/hmspabllgxqfzzricijv):
--   1) Rode a migration supabase/migrations/202611110002_my_course_enrollments_online_link.sql
--      (a 202611110001 ja esta no LAB). Persiste so a nova versao da funcao.
--   2) Rode ESTE arquivo inteiro. O resultado aparece como mensagem de erro "RESULTADO LAB ..."
--      com uma linha PASS/FAIL por caso. O erro e esperado: e ele que desfaz os dados de teste.
--   3) Confira a linha "md5 do corpo" com o valor esperado informado junto com a PR.

create or replace function pg_temp.ck(nome text, ok boolean, det text default '') returns text
language sql as $f$ select case when ok then 'PASS ' else 'FAIL ' end || nome || case when ok then '' else ' :: ' || det end || E'\n' $f$;

do $t$
declare
  v_out text := '';
  r jsonb; r2 jsonb; r3 jsonb;
  v_n1 integer; v_n2 integer; v_h1 text; v_h2 text;
  u_a uuid := '00000000-0000-4000-8000-0000000000b1';
  u_b uuid := '00000000-0000-4000-8000-0000000000b2';
  u_c uuid := '00000000-0000-4000-8000-0000000000b3';
  v_link text := 'https://meet.example.invalid/sint2-ok';
begin
  if to_regprocedure('public.my_course_enrollments()') is null
     or (select position('join_url' in prosrc) from pg_proc where oid = 'public.my_course_enrollments()'::regprocedure) = 0 then
    raise exception 'Funcao ausente ou ainda sem join_url: aplique antes a migration 202611110002.';
  end if;
  if exists (select 1 from auth.users where id in (u_a, u_b, u_c)) then
    raise exception 'Ids sinteticos ja existem: abortando.';
  end if;

  insert into auth.users(id, aud, role, email, email_confirmed_at) values
    (u_a,'authenticated','authenticated','sint2-aluna@example.invalid', now()),
    (u_b,'authenticated','authenticated','sint2-outro@example.invalid', now()),
    (u_c,'authenticated','authenticated','sint2-sem-perfil@example.invalid', now());

  insert into public.op_records(collection, id, document) values
    ('profiles','sint2-prof','{"id":"sint2-prof","display_name":"Profa. Sintetica","email":"sint2-prof@example.invalid","roles":["professional"],"active":true}'),
    ('profiles','sint2-a','{"id":"sint2-a","display_name":"Aluna Sintetica","email":"sint2-aluna@example.invalid","roles":["client"],"active":true}'),
    ('profiles','sint2-b','{"id":"sint2-b","display_name":"Outro Sintetico","email":"sint2-outro@example.invalid","roles":["client"],"active":true}'),
    ('activity_definitions','sint2-def','{"id":"sint2-def","title":"Curso Sintetico","kind":"course"}'),
    ('rooms','sint2-sala','{"id":"sint2-sala","code":"SINT2","name":"Sala Sintetica","status":"available","capacity":10}');

  -- turmas: ok / espera / concluida / cancelada / presencial / sem link / sem aula / http / javascript / duas aulas
  insert into public.op_records(collection, id, document)
  select 'activity_offerings', t.ref, jsonb_build_object('id', t.ref, 'definition_id','sint2-def','title','Turma '||t.ref,'professional_id','sint2-prof','mode', t.modo,'capacity',10)
  from (values ('sint2-ok','online'),('sint2-espera','online'),('sint2-feita','online'),('sint2-canc','online'),('sint2-pres','presencial'),
              ('sint2-semlink','online'),('sint2-semaula','online'),('sint2-http','online'),('sint2-js','online'),('sint2-dois','online'),('sint2-outro','online')) as t(ref, modo);

  insert into public.op_records(collection, id, document)
  select 'enrollments', 'e-'||t.ref, jsonb_build_object('id','e-'||t.ref,'profile_id', t.perfil,'offering_id', t.ref,'status', t.situacao)
  from (values ('sint2-ok','sint2-a','active'),('sint2-espera','sint2-a','waitlist'),('sint2-feita','sint2-a','completed'),('sint2-canc','sint2-a','cancelled'),
              ('sint2-pres','sint2-a','active'),('sint2-semlink','sint2-a','active'),('sint2-semaula','sint2-a','active'),('sint2-http','sint2-a','active'),
              ('sint2-js','sint2-a','active'),('sint2-dois','sint2-a','active'),('sint2-outro','sint2-b','active')) as t(ref, perfil, situacao);

  insert into public.op_records(collection, id, document)
  select 'schedule_items', 's-'||t.ref||'-'||t.n,
         jsonb_build_object('id','s-'||t.ref||'-'||t.n,'offering_id', t.ref,'status','booked','mode', t.modo,
                            'starts_at', (now() + t.inicio)::text, 'ends_at', (now() + t.inicio + interval '1 hour')::text, 'online_url', t.url)
           || case when t.modo = 'presencial' then jsonb_build_object('room_id','sint2-sala') else '{}'::jsonb end
  from (values
    ('sint2-ok',1,'online', interval '2 days', 'https://meet.example.invalid/sint2-ok'),
    ('sint2-espera',1,'online', interval '2 days', 'https://meet.example.invalid/sint2-espera'),
    ('sint2-feita',1,'online', interval '2 days', 'https://meet.example.invalid/sint2-feita'),
    ('sint2-canc',1,'online', interval '2 days', 'https://meet.example.invalid/sint2-canc'),
    ('sint2-pres',1,'presencial', interval '2 days', 'https://meet.example.invalid/sint2-pres'),
    ('sint2-semlink',1,'online', interval '2 days', ''),
    ('sint2-http',1,'online', interval '2 days', 'http://meet.example.invalid/sint2-http'),
    ('sint2-js',1,'online', interval '2 days', 'javascript:alert(1)'),
    ('sint2-dois',1,'online', interval '5 days', 'https://meet.example.invalid/sint2-depois'),
    ('sint2-dois',2,'online', interval '1 day', 'https://meet.example.invalid/sint2-antes'),
    ('sint2-outro',1,'online', interval '2 days', 'https://meet.example.invalid/sint2-so-do-outro')
  ) as t(ref, n, modo, inicio, url);

  select count(*), md5(string_agg(collection||id||updated_at::text||document::text, ',' order by collection, id)) into v_n1, v_h1 from public.op_records;

  -- consultas como a aluna autenticada
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r;
  execute 'reset role';

  v_out := v_out || pg_temp.ck('1 aluna ativa em turma online recebe o link', (select x->>'join_url' from jsonb_array_elements(r) x where x->>'course_ref'='sint2-ok') = v_link, r::text);
  v_out := v_out || pg_temp.ck('2 espera e concluida sem link', (select count(*) from jsonb_array_elements(r) x where x->>'course_ref' in ('sint2-espera','sint2-feita') and x->>'join_url' is null) = 2);
  v_out := v_out || pg_temp.ck('2b cancelada nao aparece', not exists (select 1 from jsonb_array_elements(r) x where x->>'course_ref'='sint2-canc'));
  v_out := v_out || pg_temp.ck('3 turma presencial sem link', (select x->>'join_url' from jsonb_array_elements(r) x where x->>'course_ref'='sint2-pres') is null);
  v_out := v_out || pg_temp.ck('4 sem link / sem aula / http / javascript: sem link',
    (select count(*) from jsonb_array_elements(r) x where x->>'course_ref' in ('sint2-semlink','sint2-semaula','sint2-http','sint2-js') and x->>'join_url' is null) = 4);
  v_out := v_out || pg_temp.ck('5 link e o da proxima aula', (select x->>'join_url' from jsonb_array_elements(r) x where x->>'course_ref'='sint2-dois') = 'https://meet.example.invalid/sint2-antes');
  v_out := v_out || pg_temp.ck('6 aluna nao recebe o link do outro', position('so-do-outro' in r::text) = 0 and not exists (select 1 from jsonb_array_elements(r) x where x->>'course_ref'='sint2-outro'));

  -- outro usuario e conta sem cadastro
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r2;
  execute 'reset role';
  v_out := v_out || pg_temp.ck('7 outro usuario ve so a propria turma e nunca o link da aluna',
    jsonb_array_length(r2) = 1 and r2->0->>'course_ref' = 'sint2-outro' and position('sint2-ok' in r2::text) = 0, r2::text);
  perform set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r3;
  execute 'reset role';
  v_out := v_out || pg_temp.ck('8 conta sem cadastro ve lista vazia', r3 = '[]'::jsonb, r3::text);

  -- anonimo e sessao sem usuario
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform public.my_course_enrollments(); v_n2 := 0; exception when insufficient_privilege then v_n2 := 1; end;
  execute 'reset role';
  v_out := v_out || pg_temp.ck('9 anon nao executa', v_n2 = 1);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin perform public.my_course_enrollments(); v_n2 := 0; exception when insufficient_privilege then v_n2 := 1; end;
  execute 'reset role';
  v_out := v_out || pg_temp.ck('9b sessao sem usuario e negada', v_n2 = 1);

  -- nada foi gravado e permissoes do catalogo
  select md5(string_agg(collection||id||updated_at::text||document::text, ',' order by collection, id)) into v_h2 from public.op_records;
  v_out := v_out || pg_temp.ck('10 op_records inalterado pelas consultas', v_h1 = v_h2);
  v_out := v_out || pg_temp.ck('11 definer + search_path vazio + stable',
    (select p.prosecdef and p.provolatile = 's' and exists (select 1 from unnest(p.proconfig) c where replace(c, '"', '') = 'search_path=') from pg_proc p where p.oid = 'public.my_course_enrollments()'::regprocedure));
  v_out := v_out || pg_temp.ck('12 authenticated com EXECUTE; anon e PUBLIC sem',
    has_function_privilege('authenticated','public.my_course_enrollments()','execute')
    and not has_function_privilege('anon','public.my_course_enrollments()','execute')
    and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'public.my_course_enrollments()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  v_out := v_out || format(E'INFO md5 do corpo: %s\n', (select md5(prosrc) from pg_proc where oid = 'public.my_course_enrollments()'::regprocedure));

  raise exception E'RESULTADO LAB (erro proposital = rollback de tudo)\n%', v_out;
end
$t$;
