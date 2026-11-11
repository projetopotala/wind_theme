-- OPERACAO MANUAL, SOMENTE LAB (hmspabllgxqfzzricijv). NAO e migration: nunca rodar em producao.
-- Homologacao de public.my_course_enrollments(): dados 100% sinteticos (@example.invalid), tudo
-- dentro de UM bloco que termina em erro proposital => rollback total, nada persiste.
--
-- Como usar (SQL Editor do projeto LAB; confira a URL: .../project/hmspabllgxqfzzricijv):
--   1) Rode a migration supabase/migrations/202611110001_my_course_enrollments.sql (persiste so a funcao).
--   2) Rode ESTE arquivo inteiro. O resultado aparece como mensagem de erro "RESULTADO LAB ..."
--      com uma linha PASS/FAIL por caso. O erro e esperado: e ele que desfaz os dados de teste.
--
-- Guardas: o bloco aborta se o banco nao for o LAB esperado (confere a existencia do schema de
-- operacao) e se encontrar dados reais com os mesmos ids sinteticos.

do $t$
declare
  v_out text := '';
  v_ok boolean;
  r jsonb;
  -- usuarios sinteticos
  u_aluna uuid := '00000000-0000-4000-8000-0000000000a1';
  u_outro uuid := '00000000-0000-4000-8000-0000000000a2';
  u_semconf uuid := '00000000-0000-4000-8000-0000000000a3';
  u_semperfil uuid := '00000000-0000-4000-8000-0000000000a4';
  u_dup uuid := '00000000-0000-4000-8000-0000000000a5';
  u_inativa uuid := '00000000-0000-4000-8000-0000000000a6';
  u_vinc uuid := '00000000-0000-4000-8000-0000000000a7';
  u_vincoff uuid := '00000000-0000-4000-8000-0000000000a8';
  u_nov uuid := '00000000-0000-4000-8000-0000000000a9';
begin
  if to_regclass('public.op_records') is null
     or to_regclass('public.appointment_profile_accounts') is null
     or to_regprocedure('public.my_course_enrollments()') is null then
    raise exception 'Banco nao parece o LAB com a migration aplicada (op_records, vinculos ou funcao ausentes).';
  end if;
  if exists (select 1 from auth.users where id in (u_aluna,u_outro,u_semconf,u_semperfil,u_dup,u_inativa,u_vinc,u_vincoff,u_nov)) then
    raise exception 'Ids sinteticos ja existem: abortando.';
  end if;

  -- usuarios (e-mail confirmado, exceto u_semconf)
  insert into auth.users(id, aud, role, email, email_confirmed_at) values
    (u_aluna,'authenticated','authenticated','sint-aluna@example.invalid', now()),
    (u_outro,'authenticated','authenticated','sint-outro@example.invalid', now()),
    (u_semconf,'authenticated','authenticated','sint-semconf@example.invalid', null),
    (u_semperfil,'authenticated','authenticated','sint-semperfil@example.invalid', now()),
    (u_dup,'authenticated','authenticated','sint-dup@example.invalid', now()),
    (u_inativa,'authenticated','authenticated','sint-inativa@example.invalid', now()),
    (u_vinc,'authenticated','authenticated','sint-vinc-conta@example.invalid', now()),
    (u_vincoff,'authenticated','authenticated','sint-vincoff@example.invalid', now()),
    (u_nov,'authenticated','authenticated','sint-nov@example.invalid', now());

  -- cadastros operacionais, definicao, turmas, inscricoes, aula (tudo em op_records)
  insert into public.op_records(collection, id, document) values
    ('profiles','sint-prof','{"id":"sint-prof","display_name":"Profa. Sintetica","email":"sint-prof@example.invalid","roles":["professional"],"active":true}'),
    ('profiles','sint-aluna','{"id":"sint-aluna","display_name":"Aluna Sintetica","email":"sint-aluna@example.invalid","roles":["client"],"active":true}'),
    ('profiles','sint-outro','{"id":"sint-outro","display_name":"Outro Sintetico","email":"sint-outro@example.invalid","roles":["client"],"active":true}'),
    ('profiles','sint-semconf','{"id":"sint-semconf","display_name":"Sem Confirmar","email":"sint-semconf@example.invalid","roles":["client"],"active":true}'),
    ('profiles','sint-dup1','{"id":"sint-dup1","display_name":"Dup 1","email":"sint-dup@example.invalid","roles":["client"],"active":true}'),
    ('profiles','sint-dup2','{"id":"sint-dup2","display_name":"Dup 2","email":"sint-dup@example.invalid","roles":["client"],"active":true}'),
    ('profiles','sint-inativa','{"id":"sint-inativa","display_name":"Inativa","email":"sint-inativa@example.invalid","roles":["client"],"active":false}'),
    ('profiles','sint-vinc','{"id":"sint-vinc","display_name":"Vinculada","email":"sint-vinc-perfil@example.invalid","roles":["client"],"active":true}'),
    ('profiles','sint-vincoff','{"id":"sint-vincoff","display_name":"Vinculo Inativo","email":"sint-vincoff@example.invalid","roles":["client"],"active":true}'),
    ('activity_definitions','sint-def','{"id":"sint-def","title":"Filosofia Sintetica","kind":"course","active":true}'),
    ('activity_offerings','sint-t1','{"id":"sint-t1","definition_id":"sint-def","title":"Turma Online Sintetica","professional_id":"sint-prof","mode":"online","capacity":10,"status":"open"}'),
    ('activity_offerings','sint-t2','{"id":"sint-t2","definition_id":"sint-def","title":"Oficina Presencial Sintetica","professional_id":"sint-prof","mode":"presencial","capacity":10,"status":"open"}'),
    ('enrollments','sint-e1','{"id":"sint-e1","profile_id":"sint-aluna","offering_id":"sint-t1","status":"active"}'),
    ('enrollments','sint-e2','{"id":"sint-e2","profile_id":"sint-aluna","offering_id":"sint-t2","status":"waitlist"}'),
    ('enrollments','sint-e3','{"id":"sint-e3","profile_id":"sint-outro","offering_id":"sint-t2","status":"active"}'),
    ('enrollments','sint-e4','{"id":"sint-e4","profile_id":"sint-semconf","offering_id":"sint-t1","status":"active"}'),
    ('enrollments','sint-e5','{"id":"sint-e5","profile_id":"sint-dup1","offering_id":"sint-t1","status":"active"}'),
    ('enrollments','sint-e6','{"id":"sint-e6","profile_id":"sint-dup2","offering_id":"sint-t1","status":"active"}'),
    ('enrollments','sint-e7','{"id":"sint-e7","profile_id":"sint-inativa","offering_id":"sint-t1","status":"active"}'),
    ('enrollments','sint-e8','{"id":"sint-e8","profile_id":"sint-vinc","offering_id":"sint-t1","status":"active"}'),
    ('enrollments','sint-e9','{"id":"sint-e9","profile_id":"sint-vincoff","offering_id":"sint-t1","status":"active"}'),
    ('enrollments','sint-e10','{"id":"sint-e10","profile_id":"sint-aluna","offering_id":"sint-t1","status":"cancelled"}');
  -- e10: inscricao ja cancelada da aluna; nao pode aparecer.
  insert into public.appointment_profile_accounts(user_id, profile_id, active) values
    (u_vinc,'sint-vinc', true), (u_vincoff,'sint-vincoff', false);

  -- 1. Owner inscreveu a aluna: ela ve as 2 inscricoes (ativa + espera), sem a cancelada
  perform set_config('request.jwt.claims', json_build_object('sub', u_aluna, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r;
  execute 'reset role';
  v_ok := jsonb_array_length(r) = 2
    and exists (select 1 from jsonb_array_elements(r) x where x->>'id' = 'sint-e1' and x->>'status' = 'inscrito'
                and x->>'teacher_name' = 'Profa. Sintetica' and x->>'modality' = 'Online' and x->>'course_title' = 'Turma Online Sintetica')
    and exists (select 1 from jsonb_array_elements(r) x where x->>'id' = 'sint-e2' and x->>'status' = 'aguardando_turma' and x->>'modality' = 'Presencial');
  v_out := v_out || format(E'%s 1-3 aluna autenticada ve so as proprias (ativa + espera), campos corretos\n', case when v_ok then 'PASS' else 'FAIL ' || r::text end);
  v_ok := not exists (select 1 from jsonb_array_elements(r) x where x->>'id' in ('sint-e3','sint-e4','sint-e5','sint-e6','sint-e7','sint-e8','sint-e9','sint-e10'));
  v_out := v_out || format(E'%s 3/6 sem inscricao alheia e sem a cancelada\n', case when v_ok then 'PASS' else 'FAIL' end);

  -- 2. aula futura vira proximo_encontro
  insert into public.op_records(collection, id, document) values
    ('schedule_items','sint-s1', json_build_object('id','sint-s1','offering_id','sint-t1','status','booked','mode','online',
       'starts_at', (now() + interval '3 days')::text, 'ends_at', (now() + interval '3 days 1 hour')::text)::jsonb),
    ('schedule_items','sint-s0', json_build_object('id','sint-s0','offering_id','sint-t2','status','booked','mode','online',
       'starts_at', (now() - interval '3 days')::text, 'ends_at', (now() - interval '3 days' + interval '1 hour')::text)::jsonb);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r;
  execute 'reset role';
  v_ok := exists (select 1 from jsonb_array_elements(r) x where x->>'id' = 'sint-e1' and x->>'status' = 'proximo_encontro' and x->>'next_session_at' is not null)
    and exists (select 1 from jsonb_array_elements(r) x where x->>'id' = 'sint-e2' and x->>'next_session_at' is null);
  v_out := v_out || format(E'%s 7 aula futura => proximo_encontro; aula passada nao conta\n', case when v_ok then 'PASS' else 'FAIL ' || r::text end);

  -- 3. outro usuario ve so a dele
  perform set_config('request.jwt.claims', json_build_object('sub', u_outro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r;
  execute 'reset role';
  v_ok := jsonb_array_length(r) = 1 and r->0->>'id' = 'sint-e3';
  v_out := v_out || format(E'%s 4 outro usuario nao ve a inscricao da aluna\n', case when v_ok then 'PASS' else 'FAIL ' || r::text end);

  -- 4. anonimo e sessao sem usuario: negados
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform public.my_course_enrollments();
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  execute 'reset role';
  v_out := v_out || format(E'%s 5 anon nao executa a funcao\n', case when v_ok then 'PASS' else 'FAIL' end);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    perform public.my_course_enrollments();
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  execute 'reset role';
  v_out := v_out || format(E'%s 5b authenticated sem sub (uid nulo) e negado\n', case when v_ok then 'PASS' else 'FAIL' end);

  -- 5. cancelada nao aparece (cancela a e1 e confere)
  update public.op_records set document = jsonb_set(document, '{status}', '"cancelled"') where collection = 'enrollments' and id = 'sint-e1';
  perform set_config('request.jwt.claims', json_build_object('sub', u_aluna, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r;
  execute 'reset role';
  v_ok := jsonb_array_length(r) = 1 and r->0->>'id' = 'sint-e2';
  v_out := v_out || format(E'%s 6 inscricao cancelada some da lista\n', case when v_ok then 'PASS' else 'FAIL ' || r::text end);

  -- 6. e-mails duplicados, e-mail nao confirmado, sem cadastro, inativa: todos vazios
  v_ok := true;
  declare u uuid; rr jsonb;
  begin
    foreach u in array array[u_dup, u_semconf, u_semperfil, u_inativa] loop
      perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select public.my_course_enrollments() into rr;
      execute 'reset role';
      if rr <> '[]'::jsonb then v_ok := false; v_out := v_out || format(E'  vazamento para %s: %s\n', u, rr::text); end if;
    end loop;
  end;
  v_out := v_out || format(E'%s 8 e-mail duplicado / nao confirmado / sem cadastro / perfil inativo => lista vazia\n', case when v_ok then 'PASS' else 'FAIL' end);

  -- 7. vinculo ativo funciona mesmo com e-mail diferente; vinculo inativo => vazio (sem cair para e-mail)
  perform set_config('request.jwt.claims', json_build_object('sub', u_vinc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r;
  execute 'reset role';
  v_ok := jsonb_array_length(r) = 1 and r->0->>'id' = 'sint-e8';
  v_out := v_out || format(E'%s 8b vinculo ativo associa a conta ao perfil certo\n', case when v_ok then 'PASS' else 'FAIL ' || r::text end);
  perform set_config('request.jwt.claims', json_build_object('sub', u_vincoff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.my_course_enrollments() into r;
  execute 'reset role';
  v_out := v_out || format(E'%s 8c vinculo inativo => vazio, sem fallback por e-mail\n', case when r = '[]'::jsonb then 'PASS' else 'FAIL ' || r::text end);

  -- 8. aluno autenticado nao escreve em op_records nem em vinculos, nem le op_records
  perform set_config('request.jwt.claims', json_build_object('sub', u_aluna, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.op_records(collection, id, document) values ('enrollments','sint-x','{"profile_id":"sint-aluna","offering_id":"sint-t1"}');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  execute 'reset role';
  v_out := v_out || format(E'%s 9 aluno nao grava inscricao pelo navegador\n', case when v_ok then 'PASS' else 'FAIL' end);
  execute 'set local role authenticated';
  begin
    perform 1 from public.op_records limit 1;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  execute 'reset role';
  v_out := v_out || format(E'%s 9b aluno nao le op_records diretamente\n', case when v_ok then 'PASS' else 'FAIL' end);

  -- 9. permissoes reais da funcao
  select has_function_privilege('anon','public.my_course_enrollments()','execute')
         or has_function_privilege('public','public.my_course_enrollments()','execute') into v_ok;
  v_out := v_out || format(E'%s 5c anon/PUBLIC sem EXECUTE (catalogo)\n', case when not v_ok then 'PASS' else 'FAIL' end);
  select has_function_privilege('authenticated','public.my_course_enrollments()','execute') into v_ok;
  v_out := v_out || format(E'%s 5d authenticated com EXECUTE (catalogo)\n', case when v_ok then 'PASS' else 'FAIL' end);
  select (p.prosecdef and exists (select 1 from unnest(p.proconfig) c where replace(c, '"', '') = 'search_path=')) from pg_proc p where p.oid = 'public.my_course_enrollments()'::regprocedure into v_ok;
  v_out := v_out || format(E'%s 1 SECURITY DEFINER com search_path vazio\n', case when v_ok then 'PASS' else 'FAIL' end);

  raise exception E'RESULTADO LAB (erro proposital = rollback de tudo)\n%', v_out;
end
$t$;
