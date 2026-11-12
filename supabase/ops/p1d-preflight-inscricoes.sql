-- P1D | Pré-aplicação e pós-aplicação. SOMENTE LEITURA: contagens e metadados.
-- Nenhum nome, e-mail ou documento pessoal é devolvido.
-- Uso: npx supabase db query --remote --read-only -f supabase/ops/p1d-preflight-inscricoes.sql
-- Antes de aplicar: todos os contadores de "bloqueia_aplicacao" devem ser 0.
-- Depois de aplicar: "instalado" deve mostrar os 3 gatilhos, o índice e as 3 funções.
with e as (select id, document d from public.op_records where collection = 'enrollments'),
     o as (select id, document d from public.op_records where collection = 'activity_offerings'),
     p as (select id from public.op_records where collection = 'profiles')
select jsonb_build_object(
  'contexto', jsonb_build_object(
    'turmas', (select count(*) from o),
    'turmas_sem_limite', (select count(*) from o where coalesce(jsonb_typeof(d -> 'capacity'), 'null') = 'null'),
    'inscricoes', (select count(*) from e),
    'inscricoes_por_situacao', (select jsonb_object_agg(coalesce(s, '(ausente)'), n) from (select d ->> 'status' s, count(*) n from e group by 1) x),
    'revisao', (select revision from public.op_meta where id = 1)
  ),
  'bloqueia_aplicacao', jsonb_build_object(
    'inscricoes_repetidas', (select count(*) from (select 1 from e group by d ->> 'profile_id', d ->> 'offering_id' having count(*) > 1) x),
    'situacao_invalida', (select count(*) from e where coalesce(d ->> 'status', '') not in ('active', 'waitlist', 'completed', 'cancelled')),
    'identificador_invalido', (select count(*) from e where jsonb_typeof(d -> 'profile_id') is distinct from 'string' or btrim(d ->> 'profile_id') = '' or jsonb_typeof(d -> 'offering_id') is distinct from 'string' or btrim(d ->> 'offering_id') = ''),
    'pessoa_inexistente', (select count(*) from e where not exists (select 1 from p where p.id = e.d ->> 'profile_id')),
    'turma_inexistente', (select count(*) from e where not exists (select 1 from o where o.id = e.d ->> 'offering_id')),
    'capacidade_invalida', (select count(*) from o where coalesce(jsonb_typeof(d -> 'capacity'), 'null') <> 'null' and not (jsonb_typeof(d -> 'capacity') = 'number' and (d ->> 'capacity') ~ '^[1-9][0-9]{0,8}$')),
    'turmas_acima_da_capacidade', (select count(*) from o where jsonb_typeof(d -> 'capacity') = 'number' and (d ->> 'capacity') ~ '^[1-9][0-9]{0,8}$' and (select count(*) from e where e.d ->> 'offering_id' = o.id and e.d ->> 'status' in ('active', 'completed')) > (o.d ->> 'capacity')::integer),
    'participante_com_inscricao_inexistente', (select count(*) from public.op_records sp where sp.collection = 'schedule_participants' and nullif(sp.document ->> 'enrollment_id', '') is not null and not exists (select 1 from e where e.id = sp.document ->> 'enrollment_id'))
  ),
  'instalado', jsonb_build_object(
    'gatilhos_p1d', (select coalesce(jsonb_agg(tgname order by tgname), '[]') from pg_trigger where tgrelid = 'public.op_records'::regclass and tgname in ('op_records_validate_enrollment', 'op_records_protect_enrollment_refs', 'op_records_validate_scope')),
    'indice_p1d', to_regclass('public.op_records_enrollment_pessoa_turma') is not null,
    'funcoes_p1d', (select coalesce(jsonb_agg(proname order by proname), '[]') from pg_proc where pronamespace = 'public'::regnamespace and proname in ('validate_op_enrollment', 'validate_op_scope', 'op_turma_capacidade')),
    'gatilhos_todos', (select jsonb_agg(tgname order by tgname) from pg_trigger where tgrelid = 'public.op_records'::regclass and not tgisinternal)
  )
) as p1d;
