-- Reverte 202611160006: restaura list_public_courses exatamente como esta em Production (16/11) e remove o catalogo
-- de cursos sem turma e o registro de interesse. ATENCAO: apagar course_interests remove os interesses registrados;
-- exportar antes, se houver algum. Os documentos da operacao (op_records) nao sao alterados.
-- Nao mexe no historico de migrations.
begin;
CREATE OR REPLACE FUNCTION public.list_public_courses()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        and coalesce(e.document ->> 'status', 'active') in ('active', 'completed')
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
$function$;

revoke all on function public.list_public_courses() from public, anon, authenticated;
grant execute on function public.list_public_courses() to anon, authenticated;
drop trigger if exists op_price_cents_guard on public.op_records;
drop function if exists public.op_price_cents_guard();
drop function if exists public.admin_list_course_interests();
drop function if exists public.register_course_interest(text);
drop function if exists public.list_public_course_definitions();
drop table if exists public.course_interests;
commit;
