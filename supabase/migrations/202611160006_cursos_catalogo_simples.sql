-- PR A de Cursos: catalogo publico em duas partes e interesse do aluno.
--
-- Reaproveita a operacao do Instituto (op_records): o Owner grava curso (activity_definitions) e turma
-- (activity_offerings) pelos comandos oficiais (definition.save / offering.save). Campos novos ficam no proprio
-- documento, preenchidos pela tela "Novo curso": published, summary, image, price_cents (inteiro em centavos).
-- Nenhuma tabela da operacao e alterada e nenhum dado existente e modificado.
--
-- 1. list_public_courses (substitui 202611160001): "Inscricoes abertas". So turma COMPLETA aparece:
--    turma divulgada e ativa; curso (atividade do tipo curso/oficina/palestra/evento/cultural) tambem divulgado;
--    descricao preenchida; professor definido; capacidade definida; proxima aula futura; valor em centavos
--    (0 = gratuito). Devolve price_cents (inteiro) no lugar de price_text. Nunca devolve dados de alunos nem link
--    de reuniao. Turmas divulgadas antes desta regra (nenhuma em Production hoje) so voltam se completas.
-- 2. list_public_course_definitions: "Outros cursos do Instituto". Curso do tipo course divulgado, com descricao,
--    que NAO tem turma aberta na lista 1. Sem preco e sem pagamento (nao ha turma para cobrar).
-- 3. course_interests + register_course_interest: o aluno autenticado registra interesse num curso da lista 2
--    (ou da 1). Identidade so por auth.uid(); um registro por pessoa e curso; RLS: cada um le apenas os seus.
-- 4. admin_list_course_interests: somente o Owner/administrador (is_portal_admin) ve os interessados.
-- 5. op_price_cents_guard: na GRAVACAO de curso ou turma, price_cents so pode ser nulo (sem valor) ou inteiro
--    de 0 a 999999999 (centavos). Texto, fracao ou negativo sao recusados (22023). Preco ausente nunca vira gratuito:
--    gratuito e o inteiro 0 explicito. Documentos existentes nao sao tocados (a regra vale para novas gravacoes).
-- Reversao: supabase/rollbacks/202611160006_rollback_cursos_catalogo_simples.sql.

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

create or replace function public.op_price_cents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collection in ('activity_definitions', 'activity_offerings')
    and new.document ? 'price_cents'
    and jsonb_typeof(new.document -> 'price_cents') <> 'null'
    and not (jsonb_typeof(new.document -> 'price_cents') = 'number'
      and (new.document ->> 'price_cents') ~ '^(0|[1-9][0-9]{0,8})$') then
    raise exception 'Valor inválido: use centavos inteiros (0 a 999999999).' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.op_price_cents_guard() from public, anon, authenticated;
drop trigger if exists op_price_cents_guard on public.op_records;
create trigger op_price_cents_guard before insert or update on public.op_records
  for each row execute function public.op_price_cents_guard();

create or replace function public.list_public_course_definitions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'title', left(btrim(d.document ->> 'title'), 160),
      'summary', left(btrim(d.document ->> 'summary'), 600),
      'kind', d.document ->> 'kind',
      'image', case when (d.document ->> 'image') ~* '^media/[a-z0-9][a-z0-9._/-]{0,200}$'
                     and (d.document ->> 'image') not like '%..%' then d.document ->> 'image' end
    ) order by btrim(d.document ->> 'title')), '[]'::jsonb)
  from public.op_records d
  where d.collection = 'activity_definitions'
    and d.document ->> 'kind' = 'course'
    and d.document ->> 'published' = 'true'
    and nullif(btrim(d.document ->> 'title'), '') is not null
    and nullif(btrim(d.document ->> 'summary'), '') is not null
    and not exists (
      select 1 from jsonb_array_elements(public.list_public_courses()) aberta
      where aberta ->> 'course_id' = d.id
    );
$$;

create table if not exists public.course_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null check (char_length(course_id) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);
alter table public.course_interests enable row level security;
revoke all on table public.course_interests from public, anon, authenticated;
grant select on table public.course_interests to authenticated;
drop policy if exists "aluno le os proprios interesses" on public.course_interests;
create policy "aluno le os proprios interesses" on public.course_interests
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.register_course_interest(p_course_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para registrar interesse.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.op_records d
    where d.collection = 'activity_definitions' and d.id = btrim(coalesce(p_course_id, ''))
      and d.document ->> 'kind' = 'course' and d.document ->> 'published' = 'true'
  ) then
    raise exception 'Curso indisponível.' using errcode = '22023';
  end if;
  insert into public.course_interests(user_id, course_id) values (v_uid, btrim(p_course_id))
  on conflict (user_id, course_id) do nothing
  returning id into v_id;
  return jsonb_build_object('registered', true, 'new', v_id is not null);
end;
$$;

create or replace function public.admin_list_course_interests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_portal_admin()) then
    raise exception 'Somente a administração vê os interessados.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'course_id', i.course_id,
      'course_title', d.document ->> 'title',
      'name', left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)), 120),
      'email', lower(u.email),
      'created_at', i.created_at
    ) order by i.created_at desc)
    from public.course_interests i
    join auth.users u on u.id = i.user_id
    left join public.op_records d on d.collection = 'activity_definitions' and d.id = i.course_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_public_courses() from public, anon, authenticated;
grant execute on function public.list_public_courses() to anon, authenticated;
revoke all on function public.list_public_course_definitions() from public, anon, authenticated;
grant execute on function public.list_public_course_definitions() to anon, authenticated;
revoke all on function public.register_course_interest(text) from public, anon, authenticated;
grant execute on function public.register_course_interest(text) to authenticated;
revoke all on function public.admin_list_course_interests() from public, anon, authenticated;
grant execute on function public.admin_list_course_interests() to authenticated;

commit;
