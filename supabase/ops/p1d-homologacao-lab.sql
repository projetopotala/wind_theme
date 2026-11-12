-- P1D | HOMOLOGAÇÃO NO LAB (hmspabllgxqfzzricijv) — DEPOIS de aplicar 202611120001.
--
-- NUNCA executar em Production.
-- Tudo roda numa transação só e é DESFEITO no fim: o bloco termina com um erro proposital
-- ("P1D-HOMOLOGACAO desfeita") cuja mensagem traz o resumo dos resultados. Nenhum dado
-- sintético permanece; nada do que existia é alterado.
--
-- As chamadas vão a public.op_apply pela via normal (is_portal_admin via auth.uid()), com a
-- sessão simulando a conta Owner do LAB lida de public.users. Sem service_role, sem nova conta.
-- Concorrência entre conexões: ver scripts/p1d-concorrencia-postgres.mjs (PostgreSQL real local).

do $homologacao$
declare
  dono uuid;
  editor uuid;
  r text;
  resumo text := '';
  falhas integer := 0;
  rev bigint;
  n integer;
  antes text;
  depois text;
begin
  if (select count(*) from public.users where role = 'owner' and active) <> 1 then
    raise exception 'Homologação: o LAB deve ter exatamente uma conta Owner ativa.';
  end if;
  if to_regclass('public.op_records_enrollment_pessoa_turma') is null
     or (select count(*) from pg_trigger where tgrelid = 'public.op_records'::regclass
          and tgname in ('op_records_validate_enrollment', 'op_records_protect_enrollment_refs', 'op_records_validate_scope')) <> 3 then
    raise exception 'Homologação: a P1D não está instalada neste banco.';
  end if;
  select id into dono from public.users where role = 'owner' and active;
  select id into editor from public.users where role = 'blog_editor' and active limit 1;

  -- Sessão como Owner (a mesma leitura de auth.uid() que o painel usa).
  perform set_config('request.jwt.claim.sub', dono::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', dono, 'role', 'authenticated')::text, true);

  -- Dados sintéticos (prefixo p1d-hml-), desfeitos no fim.
  insert into public.op_records(collection, id, document) values
    ('activity_definitions', 'p1d-hml-def', '{"id":"p1d-hml-def","title":"TESTE INTERNO P1D","kind":"course"}'),
    ('activity_offerings', 'p1d-hml-t2', '{"id":"p1d-hml-t2","title":"TESTE INTERNO P1D 2 vagas","definition_id":"p1d-hml-def","mode":"online","capacity":2}'),
    ('activity_offerings', 'p1d-hml-livre', '{"id":"p1d-hml-livre","title":"TESTE INTERNO P1D sem limite","definition_id":"p1d-hml-def","mode":"online","capacity":null}');
  insert into public.op_records(collection, id, document)
    select 'profiles', 'p1d-hml-al' || i, jsonb_build_object('id', 'p1d-hml-al' || i, 'display_name', 'TESTE INTERNO P1D ' || i, 'email', '', 'roles', jsonb_build_array('student'), 'active', true)
    from generate_series(1, 5) i;

  -- Executa um caso e confere o resultado (ok ou SQLSTATE).
  create temporary table p1d_caso(n serial, nome text, esperado text, obtido text) on commit drop;

  -- Helper: op_apply com a revisão atual e chave nova; devolve 'ok' ou o SQLSTATE.
  create or replace function pg_temp.p1d_op(acao text, alteracoes jsonb, chave text default null, revisao bigint default null)
  returns text language plpgsql as $f$
  begin
    perform public.op_apply(coalesce(revisao, (select revision from public.op_meta where id = 1)),
      coalesce(chave, 'p1d-hml-' || gen_random_uuid()), acao, '{}'::jsonb, null, alteracoes);
    return 'ok';
  exception when others then
    return sqlstate;
  end $f$;
  create or replace function pg_temp.p1d_ins(id text, pessoa text, turma text, situacao text default 'active')
  returns jsonb language sql as $f$
    select jsonb_build_object('table', 'enrollments', 'id', id, 'after', jsonb_build_object('id', id, 'profile_id', pessoa, 'offering_id', turma, 'status', situacao))
  $f$;

  insert into p1d_caso(nome, esperado, obtido) values
    ('01 inscrição válida (gatilho aceita)', 'ok', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-e1', 'p1d-hml-al1', 'p1d-hml-t2')))),
    ('02 inscrição duplicada (índice único)', '23505', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-e1b', 'p1d-hml-al1', 'p1d-hml-t2', 'waitlist')))),
    ('03a segunda vaga', 'ok', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-e2', 'p1d-hml-al2', 'p1d-hml-t2')))),
    ('03b turma lotada (gatilho 23514)', '23514', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-e3', 'p1d-hml-al3', 'p1d-hml-t2')))),
    ('05 lista de espera com a turma cheia', 'ok', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-w3', 'p1d-hml-al3', 'p1d-hml-t2', 'waitlist')))),
    ('06a promoção sem vaga', '23514', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-w3', 'p1d-hml-al3', 'p1d-hml-t2', 'active')))),
    ('07a cancelamento libera vaga', 'ok', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-e2', 'p1d-hml-al2', 'p1d-hml-t2', 'cancelled')))),
    ('06b promoção com vaga', 'ok', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-w3', 'p1d-hml-al3', 'p1d-hml-t2', 'active')))),
    ('07b reativar cancelada sem vaga', '23514', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-e2', 'p1d-hml-al2', 'p1d-hml-t2', 'active')))),
    ('09a reduzir capacidade abaixo das ocupadas', '23514', pg_temp.p1d_op('offering.save', jsonb_build_array(jsonb_build_object('table', 'activity_offerings', 'id', 'p1d-hml-t2', 'after', '{"id":"p1d-hml-t2","title":"TESTE INTERNO P1D 2 vagas","definition_id":"p1d-hml-def","mode":"online","capacity":1}'::jsonb)))),
    ('09b aumentar capacidade (offering.save legítimo)', 'ok', pg_temp.p1d_op('offering.save', jsonb_build_array(jsonb_build_object('table', 'activity_offerings', 'id', 'p1d-hml-t2', 'after', '{"id":"p1d-hml-t2","title":"TESTE INTERNO P1D 2 vagas","definition_id":"p1d-hml-def","mode":"online","capacity":3}'::jsonb)))),
    ('10 pessoa inexistente', '23503', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-x1', 'p1d-hml-ninguem', 'p1d-hml-t2', 'waitlist')))),
    ('11 turma inexistente', '23503', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-x2', 'p1d-hml-al4', 'p1d-hml-nenhuma', 'waitlist')))),
    ('12 situação inválida', '22023', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-x3', 'p1d-hml-al4', 'p1d-hml-t2', 'pendente')))),
    ('15 ação incompatível (person.save grava inscrição)', '22023', pg_temp.p1d_op('person.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-x4', 'p1d-hml-al4', 'p1d-hml-livre')))),
    ('16 coleção diferente (enrollment.save altera perfil)', '22023', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-x5', 'p1d-hml-al4', 'p1d-hml-livre'), jsonb_build_object('table', 'profiles', 'id', 'p1d-hml-al5', 'after', '{"id":"p1d-hml-al5","display_name":"x","roles":["professional"],"active":true}'::jsonb)))),
    ('17a apagar pessoa com inscrição', '23503', pg_temp.p1d_op('person.save', '[{"table":"profiles","id":"p1d-hml-al1","after":null}]'::jsonb)),
    ('17b apagar turma com inscrição', '23503', pg_temp.p1d_op('offering.save', '[{"table":"activity_offerings","id":"p1d-hml-t2","after":null}]'::jsonb)),
    ('18 enrollment.save com 3 registros (turma sem limite)', 'ok', pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-m1', 'p1d-hml-al1', 'p1d-hml-livre'), pg_temp.p1d_ins('p1d-hml-m2', 'p1d-hml-al2', 'p1d-hml-livre'), pg_temp.p1d_ins('p1d-hml-m3', 'p1d-hml-al3', 'p1d-hml-livre', 'waitlist'))));

  -- 13. Repetição da mesma operação: devolve o resultado anterior, nada novo (idempotência).
  r := pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-k1', 'p1d-hml-al4', 'p1d-hml-livre', 'waitlist')), 'p1d-hml-chave-fixa');
  rev := (select revision from public.op_meta where id = 1);
  r := r || '/' || pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-k1', 'p1d-hml-al4', 'p1d-hml-livre', 'waitlist')), 'p1d-hml-chave-fixa', rev - 1);
  select count(*) into n from public.op_records where collection = 'enrollments' and id = 'p1d-hml-k1';
  insert into p1d_caso(nome, esperado, obtido) values ('13 repetição da mesma chave (idempotência)', 'ok/ok/1', r || '/' || n);

  -- 14. Revisão desatualizada.
  insert into p1d_caso(nome, esperado, obtido) values ('14 revisão desatualizada (PT409)', 'PT409',
    pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-r1', 'p1d-hml-al5', 'p1d-hml-livre', 'waitlist')), null, (select revision from public.op_meta where id = 1) - 1));

  -- Atomicidade com a auditoria: a recusa de escopo não deixa evento, chave nem revisão nova.
  antes := (select revision from public.op_meta where id = 1) || '/' || (select count(*) from public.op_records where collection = 'audit_events') || '/' || (select count(*) from public.op_requests);
  r := pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-a1', 'p1d-hml-al5', 'p1d-hml-livre'), jsonb_build_object('table', 'rooms', 'id', 'p1d-hml-sala', 'after', '{"id":"p1d-hml-sala","code":"P1DHML","name":"x","status":"unconfirmed"}'::jsonb)));
  depois := (select revision from public.op_meta where id = 1) || '/' || (select count(*) from public.op_records where collection = 'audit_events') || '/' || (select count(*) from public.op_requests);
  insert into p1d_caso(nome, esperado, obtido) values ('19 recusa de escopo desfaz evento, chave e revisão', '22023 sem mudança', r || case when antes = depois and not exists (select 1 from public.op_records where id in ('p1d-hml-a1', 'p1d-hml-sala')) then ' sem mudança' else ' MUDOU' end);

  -- 4. Concorrência: não é possível entre conexões dentro de uma transação só; ver o script local.
  -- Autorização: conta sem administração (uuid inexistente) e, se houver, Writer/Editor do Blog.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000dead', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dead","role":"authenticated"}', true);
  insert into p1d_caso(nome, esperado, obtido) values ('20 conta sem administração (autorização)', '42501',
    pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-z1', 'p1d-hml-al5', 'p1d-hml-livre', 'waitlist'))));
  if editor is not null then
    perform set_config('request.jwt.claim.sub', editor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', editor, 'role', 'authenticated')::text, true);
    insert into p1d_caso(nome, esperado, obtido) values ('21 Writer/Editor do Blog (autorização)', '42501',
      pg_temp.p1d_op('enrollment.save', jsonb_build_array(pg_temp.p1d_ins('p1d-hml-z2', 'p1d-hml-al5', 'p1d-hml-livre', 'waitlist'))));
  end if;

  select count(*) filter (where c.esperado <> c.obtido),
         string_agg(case when c.esperado = c.obtido then '✔ ' else '✖ ' end || c.nome || ' — esperado ' || c.esperado || ', obtido ' || c.obtido, E'\n' order by c.n)
    into falhas, resumo from p1d_caso c;

  raise exception E'P1D-HOMOLOGACAO desfeita (nada gravado). Falhas: %\n%', falhas, resumo using errcode = 'P0001';
end;
$homologacao$;
