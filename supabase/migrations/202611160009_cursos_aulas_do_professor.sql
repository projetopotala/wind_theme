-- Cursos: aulas de quem ministra (professor atribuido a turma) + janela de entrada na sala online.
--
-- Causa: o link da aula online so saia de public.my_course_enrollments(), que exige uma matricula de
-- ALUNO. Quem e o professor da turma nao tem (nem deve ter) matricula; para entrar precisava passar
-- por inscricao e pagamento. Alem disso o link era entregue desde o agendamento da aula.
--
-- 1) public.course_room_state(inicio, fim, em): regra UNICA da janela, no banco:
--      abre 15 minutos antes do inicio; aberta durante a aula; fecha 30 minutos depois do fim previsto
--      (limites inclusivos). Compara instantes (timestamptz): o fuso so afeta a exibicao.
-- 2) public.my_teaching_courses(): somente leitura. Autoriza pelo VINCULO REAL, decidido no banco:
--      vinculo ATIVO em appointment_profile_accounts + perfil com papel 'professional' ativo +
--      activity_offerings.document.professional_id = esse perfil (mesma regra de
--      my_appointment_professional_profiles). Trocar o professional_id da turma ou desativar o
--      vinculo/perfil retira o acesso na hora (nada e copiado).
-- 3) public.my_course_enrollments(): mesma funcao da 202611110002 (mesmas identidade, filtros de
--      matricula e permissoes), agora com a MESMA janela e dois campos novos (join_opens_at,
--      join_closes_at, room_state). Aluno continua exigindo matricula ATIVA.
--
-- O link e o MESMO para professor e alunos (schedule_items.document.online_url da aula da janela;
-- turma e aula online; https valido). Fora da janela a funcao devolve join_url nulo: o link nao e
-- entregue antes da hora nem depois do fechamento. Aulas canceladas e presenciais nunca liberam link.
-- Nao cria matricula, pedido, cobranca nem evento.
--
-- LIMITE REAL: o link e uma reuniao EXTERNA (qualquer https cadastrado pelo Owner). O Portal controla
-- quem RECEBE o link e quando, mas nao controla o provedor: quem ja tem o link (ou o recebeu de
-- alguem) pode abri-lo diretamente, e um link ja entregue continua valendo no provedor. Fechar a
-- entrada por identidade/horario dentro da propria reuniao exige token emitido pelo servidor
-- (como nas salas de Atendimentos, LiveKit) ou sala com sala de espera/convite no provedor.
--
-- Reversao: supabase/rollbacks/202611160009_rollback_cursos_aulas_do_professor.sql.

begin;

create or replace function public.course_room_state(
  p_starts timestamptz,
  p_ends timestamptz,
  p_at timestamptz default now()
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_starts is null or p_ends is null or p_at is null then null
    when p_at < p_starts - interval '15 minutes' then 'abre_depois'
    when p_at > p_ends + interval '30 minutes' then 'encerrada'
    else 'aberta'
  end;
$$;

revoke all on function public.course_room_state(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.my_teaching_courses()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para ver suas aulas.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(item.linha order by item.ordem nulls last, item.ref)
    from (
      select
        o.id as ref,
        prox.proxima as ordem,
        jsonb_build_object(
          'id', o.id,
          'course_ref', o.id,
          'course_title', left(coalesce(
            nullif(btrim(o.document ->> 'title'), ''),
            nullif(btrim(d.document ->> 'title'), ''),
            'Turma'), 160),
          'modality', case when o.document ->> 'mode' = 'online' then 'Online' else 'Presencial' end,
          'status', case when prox.proxima is not null then 'proximo_encontro' else 'sem_aula_marcada' end,
          'next_session_at', prox.proxima,
          'join_opens_at', prox.proxima - interval '15 minutes',
          'join_closes_at', prox.fim + interval '30 minutes',
          'room_state', case when prox.fim is null then null else public.course_room_state(prox.proxima, prox.fim) end,
          'students', (
            select count(*)::integer
            from public.op_records e
            where e.collection = 'enrollments'
              and e.document ->> 'offering_id' = o.id
              and coalesce(e.document ->> 'status', 'active') = 'active'
          ),
          'join_url', case
            when o.document ->> 'mode' = 'online'
             and prox.modo = 'online'
             and prox.fim is not null
             and public.course_room_state(prox.proxima, prox.fim) = 'aberta'
             and char_length(prox.link) <= 2000
             and prox.link ~* '^https://[a-z0-9][^[:space:]<>"''\\]*$'
            then prox.link
            else null
          end
        ) as linha
      from public.appointment_profile_accounts conta
      join public.op_records perfil
        on perfil.collection = 'profiles' and perfil.id = conta.profile_id
      join public.op_records o
        on o.collection = 'activity_offerings' and o.document ->> 'professional_id' = conta.profile_id
      left join public.op_records d
        on d.collection = 'activity_definitions' and d.id = o.document ->> 'definition_id'
      left join lateral (
        select
          (s.document ->> 'starts_at')::timestamptz as proxima,
          (s.document ->> 'ends_at')::timestamptz as fim,
          s.document ->> 'mode' as modo,
          nullif(btrim(s.document ->> 'online_url'), '') as link
        from public.op_records s
        where s.collection = 'schedule_items'
          and s.document ->> 'offering_id' = o.id
          and coalesce(s.document ->> 'status', 'booked') = 'booked'
          and (s.document ->> 'ends_at')::timestamptz + interval '30 minutes' >= now()
        order by (public.course_room_state((s.document ->> 'starts_at')::timestamptz, (s.document ->> 'ends_at')::timestamptz) <> 'aberta'),
                 ((s.document ->> 'ends_at')::timestamptz < now()),
                 (s.document ->> 'starts_at')::timestamptz, s.id
        limit 1
      ) prox on true
      where conta.user_id = v_uid
        and conta.active = true
        and coalesce(perfil.document -> 'roles', '[]'::jsonb) ? 'professional'
        and coalesce((perfil.document ->> 'active')::boolean, true)
    ) item
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_teaching_courses() from public, anon, authenticated;
grant execute on function public.my_teaching_courses() to authenticated;

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
          'join_opens_at', prox.proxima - interval '15 minutes',
          'join_closes_at', prox.fim + interval '30 minutes',
          'room_state', case when prox.fim is null then null else public.course_room_state(prox.proxima, prox.fim) end,
          'join_url', case
            when coalesce(e.document ->> 'status', 'active') = 'active'
             and o.document ->> 'mode' = 'online'
             and prox.modo = 'online'
             and prox.fim is not null
             and public.course_room_state(prox.proxima, prox.fim) = 'aberta'
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
          (s.document ->> 'ends_at')::timestamptz as fim,
          s.document ->> 'mode' as modo,
          nullif(btrim(s.document ->> 'online_url'), '') as link
        from public.op_records s
        where s.collection = 'schedule_items'
          and s.document ->> 'offering_id' = o.id
          and coalesce(s.document ->> 'status', 'booked') = 'booked'
          and (s.document ->> 'ends_at')::timestamptz + interval '30 minutes' >= now()
        order by (public.course_room_state((s.document ->> 'starts_at')::timestamptz, (s.document ->> 'ends_at')::timestamptz) <> 'aberta'),
                 ((s.document ->> 'ends_at')::timestamptz < now()),
                 (s.document ->> 'starts_at')::timestamptz, s.id
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

commit;
