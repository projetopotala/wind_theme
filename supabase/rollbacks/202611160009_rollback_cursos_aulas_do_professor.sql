-- Reversao da 202611160009: devolve my_course_enrollments() ao corpo da 202611110002 e remove as
-- funcoes novas. Somente funcoes; nenhum dado e tocado.
begin;

create or replace function public.my_course_enrollments()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_link public.appointment_profile_accounts%rowtype;
  v_profile_id text;
  v_email text;
  v_matches integer;
  v_active boolean;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para ver seus cursos.' using errcode = '42501';
  end if;

  select * into v_link from public.appointment_profile_accounts where user_id = v_uid;

  if found then
    if v_link.active is not true then
      return '[]'::jsonb;
    end if;
    select p.id, coalesce((p.document ->> 'active')::boolean, true)
      into v_profile_id, v_active
    from public.op_records p
    where p.collection = 'profiles' and p.id = v_link.profile_id;
    if v_profile_id is null or v_active is not true then
      return '[]'::jsonb;
    end if;
  else
    select lower(nullif(btrim(u.email), '')) into v_email
    from auth.users u
    where u.id = v_uid and u.email_confirmed_at is not null and u.deleted_at is null;
    if v_email is null then
      return '[]'::jsonb;
    end if;
    -- Defesa extra: se mais de uma conta confirmada tiver este e-mail, ninguem e associado.
    if (select count(*) from auth.users u
        where lower(nullif(btrim(u.email), '')) = v_email
          and u.email_confirmed_at is not null and u.deleted_at is null) <> 1 then
      return '[]'::jsonb;
    end if;

    select count(*)::integer, min(p.id)
      into v_matches, v_profile_id
    from public.op_records p
    where p.collection = 'profiles'
      and lower(nullif(btrim(p.document ->> 'email'), '')) = v_email;
    if v_matches is distinct from 1 then
      return '[]'::jsonb;
    end if;

    select coalesce((p.document ->> 'active')::boolean, true) into v_active
    from public.op_records p
    where p.collection = 'profiles' and p.id = v_profile_id;
    if v_active is not true then
      return '[]'::jsonb;
    end if;
    if exists (
      select 1 from public.appointment_profile_accounts a where a.profile_id = v_profile_id
    ) then
      return '[]'::jsonb;
    end if;
  end if;

  return coalesce((
    select jsonb_agg(item.linha order by item.ordem desc)
    from (
      select
        e.updated_at as ordem,
        jsonb_build_object(
          'id', e.id,
          'course_ref', o.id,
          'course_title', left(coalesce(
            nullif(btrim(o.document ->> 'title'), ''),
            nullif(btrim(d.document ->> 'title'), ''),
            'Turma'), 160),
          'teacher_name', left(coalesce(prof.document ->> 'display_name', ''), 120),
          'modality', case when o.document ->> 'mode' = 'online' then 'Online' else 'Presencial' end,
          'status', case coalesce(e.document ->> 'status', 'active')
            when 'waitlist' then 'aguardando_turma'
            when 'completed' then 'concluido'
            else case when prox.proxima is not null then 'proximo_encontro' else 'inscrito' end
          end,
          'next_session_at', prox.proxima,
          'join_url', case
            when coalesce(e.document ->> 'status', 'active') = 'active'
             and o.document ->> 'mode' = 'online'
             and prox.modo = 'online'
             and char_length(prox.link) <= 2000
             and prox.link ~* '^https://[a-z0-9][^[:space:]<>"''\\]*$'
            then prox.link
            else null
          end,
          'enrolled_at', e.updated_at
        ) as linha
      from public.op_records e
      join public.op_records o
        on o.collection = 'activity_offerings' and o.id = e.document ->> 'offering_id'
      left join public.op_records d
        on d.collection = 'activity_definitions' and d.id = o.document ->> 'definition_id'
      left join public.op_records prof
        on prof.collection = 'profiles' and prof.id = o.document ->> 'professional_id'
      left join lateral (
        select
          (s.document ->> 'starts_at')::timestamptz as proxima,
          s.document ->> 'mode' as modo,
          nullif(btrim(s.document ->> 'online_url'), '') as link
        from public.op_records s
        where s.collection = 'schedule_items'
          and s.document ->> 'offering_id' = o.id
          and coalesce(s.document ->> 'status', 'booked') = 'booked'
          and (s.document ->> 'ends_at')::timestamptz > now()
        order by (s.document ->> 'starts_at')::timestamptz, s.id
        limit 1
      ) prox on true
      where e.collection = 'enrollments'
        and e.document ->> 'profile_id' = v_profile_id
        and coalesce(e.document ->> 'status', 'active') in ('active', 'waitlist', 'completed')
    ) item
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_course_enrollments() from public, anon, authenticated;
grant execute on function public.my_course_enrollments() to authenticated;

drop function if exists public.my_teaching_courses();
drop function if exists public.course_room_state(timestamptz, timestamptz, timestamptz);

commit;
