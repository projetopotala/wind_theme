-- Cursos publicos: leitura publica das turmas que o Owner marcou para divulgacao.
--
-- Contexto: as turmas oficiais ficam em public.op_records (collection 'activity_offerings') e so o
-- administrador as le. A pagina publica Cursos nao tinha como mostrar o que o Instituto oferece de
-- verdade. Esta migration cria UMA funcao de leitura, sem tabelas, colunas ou politicas novas.
--
-- O que a funcao devolve (e somente isto), por turma:
--   id, titulo, resumo, tipo, modalidade, capacidade, vagas restantes, disponibilidade, valor (texto livre
--   do Owner), imagem (somente caminho relativo em media/), nome de quem conduz e a PROXIMA aula
--   (inicio, fim e modalidade).
-- O que ela NUNCA devolve: inscricoes, nomes ou e-mails de alunos, telefone, link da reuniao online
-- (online_url), documentos administrativos, pedidos de atendimento.
--
-- Regra de divulgacao (todas precisam valer):
--   * document.published = true na turma (marcacao explicita do Owner; turmas sem a marca, como as
--     TESTE INTERNO, nao saem);
--   * a turma nao esta marcada como inativa (document.active = false);
--   * a atividade ligada (definition_id) existe e seu tipo e curso, workshop, palestra, evento ou
--     atividade cultural. Atendimento, locacao e grupo nunca aparecem como curso.
-- Vagas: contam inscricoes active e completed, a mesma regra de op_turma_capacidade (202611120001).
--
-- Seguranca: SECURITY DEFINER com search_path vazio, somente leitura (STABLE); EXECUTE para anon e
-- authenticated; nenhum acesso direto a op_records e concedido. Reaplicar e seguro (create or replace).
-- Reversao: supabase/rollbacks/202611160001_rollback_cursos_publicos.sql (remove a funcao; nenhum dado).

begin;

create or replace function public.list_public_courses()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c.linha order by c.ordem nulls last, c.titulo), '[]'::jsonb)
  from (
    select
      prox.inicio as ordem,
      left(coalesce(nullif(btrim(o.document ->> 'title'), ''), nullif(btrim(d.document ->> 'title'), ''), 'Turma'), 160) as titulo,
      jsonb_build_object(
        'id', o.id,
        'title', left(coalesce(nullif(btrim(o.document ->> 'title'), ''), nullif(btrim(d.document ->> 'title'), ''), 'Turma'), 160),
        'summary', left(coalesce(btrim(o.document ->> 'summary'), ''), 600),
        'kind', d.document ->> 'kind',
        'mode', case when o.document ->> 'mode' = 'online' then 'online' else 'presencial' end,
        'capacity', case when (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$' then (o.document ->> 'capacity')::integer end,
        'spots_left', case when (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$'
          then greatest((o.document ->> 'capacity')::integer - ocup.n, 0) end,
        'availability', case
          when (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$' and ocup.n >= (o.document ->> 'capacity')::integer then 'esgotado'
          else 'aberta' end,
        'price_text', left(coalesce(btrim(o.document ->> 'price_text'), ''), 80),
        'image', case when (o.document ->> 'image') ~* '^media/[a-z0-9][a-z0-9._/-]{0,200}$'
                       and (o.document ->> 'image') not like '%..%' then o.document ->> 'image' end,
        'teacher_name', left(coalesce(prof.document ->> 'display_name', ''), 120),
        'next_session', case when prox.inicio is null then null else jsonb_build_object(
          'starts_at', prox.inicio, 'ends_at', prox.fim, 'mode', prox.modo) end
      ) as linha
    from public.op_records o
    join public.op_records d
      on d.collection = 'activity_definitions'
     and d.id = o.document ->> 'definition_id'
     and d.document ->> 'kind' in ('course', 'workshop', 'lecture', 'event', 'cultural')
    left join public.op_records prof
      on prof.collection = 'profiles' and prof.id = o.document ->> 'professional_id'
    left join lateral (
      select count(*)::integer as n
      from public.op_records e
      where e.collection = 'enrollments'
        and e.document ->> 'offering_id' = o.id
        and e.document ->> 'status' in ('active', 'completed')
    ) ocup on true
    left join lateral (
      select (s.document ->> 'starts_at')::timestamptz as inicio,
             (s.document ->> 'ends_at')::timestamptz as fim,
             case when s.document ->> 'mode' = 'online' then 'online' else 'presencial' end as modo
      from public.op_records s
      where s.collection = 'schedule_items'
        and s.document ->> 'offering_id' = o.id
        and coalesce(s.document ->> 'status', 'booked') = 'booked'
        and (s.document ->> 'ends_at')::timestamptz > now()
      order by (s.document ->> 'starts_at')::timestamptz, s.id
      limit 1
    ) prox on true
    where o.collection = 'activity_offerings'
      and o.document ->> 'published' = 'true'
      and coalesce(o.document ->> 'active', 'true') <> 'false'
  ) c;
$$;

revoke all on function public.list_public_courses() from public, anon, authenticated;
grant execute on function public.list_public_courses() to anon, authenticated;

commit;
