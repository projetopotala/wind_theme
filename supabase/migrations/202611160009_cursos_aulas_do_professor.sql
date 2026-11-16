-- Cursos: aulas de quem ministra (professor atribuido a turma), sem matricula e sem pagamento.
--
-- Causa: o link da aula online so saia de public.my_course_enrollments(), que exige uma matricula de
-- ALUNO. Quem e o professor da turma nao tem (nem deve ter) matricula; para entrar precisava passar
-- por inscricao e pagamento.
--
-- Esta funcao e somente leitura e autoriza pelo VINCULO REAL, decidido no banco:
--   * a conta logada (auth.uid()) tem vinculo ATIVO em appointment_profile_accounts;
--   * o perfil vinculado tem o papel 'professional' e esta ativo (mesma regra de
--     my_appointment_professional_profiles / is_appointment_professional);
--   * a turma (activity_offerings) tem document.professional_id = esse perfil.
-- Trocar o professional_id da turma, desativar o vinculo ou o perfil retira o acesso na hora (nada e
-- copiado: a funcao recalcula a cada chamada).
--
-- O link e o MESMO que o aluno recebe (schedule_items.document.online_url da PROXIMA aula, nao
-- encerrada, online, https valido) e so sai quando a turma e a aula sao online. Aulas posteriores,
-- passadas ou canceladas nao liberam link. Nao cria matricula, pedido, cobranca nem evento.
--
-- Nao altera my_course_enrollments (aluno continua exigindo matricula ativa) nem pagamentos.
-- Reversao: supabase/rollbacks/202611160009_rollback_cursos_aulas_do_professor.sql.

begin;

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

commit;
