-- Reverte 202611160007. Restaura list_public_courses (texto de 202611160006, igual a Production apos a PR #77),
-- remove funcoes e o gatilho de capacidade dos pedidos. PEDIDOS REAIS SAO PRESERVADOS: se houver qualquer pedido,
-- as tabelas ficam intactas (sem acesso de leitura para authenticated); recuperacao: reaplicar 202611160007
-- (create table if not exists mantem as linhas). Tabelas vazias sao removidas. op_records nao e alterado.
-- Nao mexe no historico de migrations.
begin;
create or replace function public.list_public_courses()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c.linha order by c.ordem, c.titulo), '[]'::jsonb)
  from (
    select
      prox.inicio as ordem,
      left(coalesce(nullif(btrim(o.document ->> 'title'), ''), nullif(btrim(d.document ->> 'title'), '')), 160) as titulo,
      jsonb_build_object(
        'id', o.id,
        'course_id', d.id,
        'title', left(coalesce(nullif(btrim(o.document ->> 'title'), ''), nullif(btrim(d.document ->> 'title'), '')), 160),
        'summary', left(coalesce(nullif(btrim(o.document ->> 'summary'), ''), btrim(d.document ->> 'summary')), 600),
        'kind', d.document ->> 'kind',
        'mode', case when o.document ->> 'mode' = 'online' then 'online' else 'presencial' end,
        'capacity', (o.document ->> 'capacity')::integer,
        'spots_left', greatest((o.document ->> 'capacity')::integer - ocup.n, 0),
        'availability', case when ocup.n >= (o.document ->> 'capacity')::integer then 'esgotado' else 'aberta' end,
        'price_cents', preco.centavos,
        'image', case when img.caminho ~* '^media/[a-z0-9][a-z0-9._/-]{0,200}$' and img.caminho not like '%..%' then img.caminho end,
        'teacher_name', left(coalesce(prof.document ->> 'display_name', ''), 120),
        'next_session', jsonb_build_object('starts_at', prox.inicio, 'ends_at', prox.fim, 'mode', prox.modo)
      ) as linha
    from public.op_records o
    join public.op_records d
      on d.collection = 'activity_definitions'
     and d.id = o.document ->> 'definition_id'
     and d.document ->> 'kind' in ('course', 'workshop', 'lecture', 'event', 'cultural')
     and d.document ->> 'published' = 'true'
    join public.op_records prof
      on prof.collection = 'profiles' and prof.id = o.document ->> 'professional_id'
    cross join lateral (
      select case
        when (o.document ->> 'price_cents') ~ '^[0-9]{1,9}$' then (o.document ->> 'price_cents')::integer
        when (d.document ->> 'price_cents') ~ '^[0-9]{1,9}$' then (d.document ->> 'price_cents')::integer
      end as centavos
    ) preco
    cross join lateral (
      select coalesce(nullif(btrim(o.document ->> 'image'), ''), nullif(btrim(d.document ->> 'image'), '')) as caminho
    ) img
    cross join lateral (
      select count(*)::integer as n
      from public.op_records e
      where e.collection = 'enrollments'
        and e.document ->> 'offering_id' = o.id
        and coalesce(e.document ->> 'status', 'active') in ('active', 'completed')
    ) ocup
    join lateral (
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
      and (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$'
      and preco.centavos is not null
      and coalesce(nullif(btrim(o.document ->> 'summary'), ''), nullif(btrim(d.document ->> 'summary'), '')) is not null
  ) c;
$$;

revoke all on function public.list_public_courses() from public, anon, authenticated;
grant execute on function public.list_public_courses() to anon, authenticated;
drop trigger if exists op_enrollment_respeita_pedidos on public.op_records;
drop function if exists public.op_enrollment_respeita_pedidos();
drop function if exists public.confirm_course_enrollment_payment(uuid, integer);
drop function if exists public.admin_decide_course_enrollment_request(uuid, timestamptz, text);
drop function if exists public.admin_list_course_enrollment_requests();
drop function if exists public.cancel_my_course_enrollment_request(uuid);
drop function if exists public.course_enrollment_transition(uuid, timestamptz, text, text);
drop function if exists public.my_course_enrollment_requests();
drop function if exists public.request_course_enrollment(uuid, text);
drop function if exists public.course_seats_taken(text);
do $guard$
begin
  if to_regclass('public.course_enrollment_requests') is null then
    return;
  end if;
  if exists (select 1 from public.course_enrollment_requests) then
    revoke all on table public.course_enrollment_requests from public, anon, authenticated;
    revoke all on table public.course_enrollment_request_events from public, anon, authenticated;
    raise notice 'Pedidos de inscricao preservados; reaplique 202611160007 para restaurar o acesso.';
  else
    drop table public.course_enrollment_request_events;
    drop table public.course_enrollment_requests;
  end if;
end;
$guard$;
commit;
