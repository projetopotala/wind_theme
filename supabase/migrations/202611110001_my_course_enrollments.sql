-- Meus cursos: as inscrições feitas pelo Owner/Admin em "Cursos e atividades" (op_records)
-- passam a aparecer, somente leitura, para a conta autenticada dona da inscrição.
--
-- Fonte única: public.op_records. Nada é copiado para public.enrollments e nada é
-- sincronizado; esta função só LÊ. Ela não cria, altera nem remove vínculos, perfis,
-- turmas ou inscrições.
--
-- Quem é "a própria pessoa" (a identidade vem SEMPRE de auth.uid(); não há parâmetro):
--   1. Vínculo em public.appointment_profile_accounts: vale se estiver ATIVO e o perfil
--      operacional existir e estiver ativo. Se existir vínculo inválido (inativo, perfil
--      ausente ou inativo), a resposta é vazia — não há queda para o e-mail.
--   2. Sem nenhum vínculo: associação por e-mail, somente se o e-mail da conta estiver
--      CONFIRMADO e houver EXATAMENTE UM cadastro operacional com esse e-mail (ativo ou
--      não), esse cadastro estiver ativo e NÃO estiver vinculado a outra conta.
--   3. Qualquer outro caso (sem e-mail confirmado, e-mail confirmado em mais de uma conta,
--      nenhum cadastro, duplicados, inativo, já vinculado a outra conta): lista vazia, sem erro.
--
-- Campos devolvidos: só o que a tela "Meus cursos" mostra. Situações da inscrição:
--   active -> inscrito (ou proximo_encontro, se houver aula futura da turma)
--   waitlist -> aguardando_turma; completed -> concluido; cancelled -> não aparece.
--
-- Reversão: drop function public.my_course_enrollments();

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
    -- Defesa extra: se mais de uma conta confirmada tiver este e-mail, ninguém é associado.
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
        select min((s.document ->> 'starts_at')::timestamptz) as proxima
        from public.op_records s
        where s.collection = 'schedule_items'
          and s.document ->> 'offering_id' = o.id
          and coalesce(s.document ->> 'status', 'booked') = 'booked'
          and (s.document ->> 'ends_at')::timestamptz > now()
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

commit;
