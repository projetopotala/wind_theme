-- Reversao da 202611160008 (recebimento manual de cursos).
-- Preserva a auditoria financeira: as funcoes novas saem e a lista volta ao formato anterior, mas as tabelas de
-- recebimentos e a trilha so sao removidas se estiverem VAZIAS. Se houver recebimento registrado, elas ficam
-- (com os gatilhos de imutabilidade) e a origem "manual" continua aceita nos eventos dos pedidos.
-- Nao mexe em pedidos, matriculas operacionais nem na funcao de pagamento do servidor.

begin;

drop function if exists public.admin_register_manual_course_payment(uuid, uuid, timestamptz, integer, text, date, text);
drop function if exists public.admin_reverse_manual_course_payment(uuid, text, text);
drop function if exists public.course_payment_is_owner();

create or replace function public.admin_list_course_enrollment_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_portal_admin()) then
    raise exception 'Somente a administração vê as inscrições.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'price_cents', r.price_cents, 'created_at', r.created_at, 'updated_at', r.updated_at,
      'offering_id', r.offering_id,
      'course_title', coalesce(nullif(btrim(d.document ->> 'title'), ''), o.document ->> 'title'),
      'offering_title', o.document ->> 'title',
      'student_name', left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)), 120),
      'student_email', lower(u.email),
      'capacity', case when (o.document ->> 'capacity') ~ '^[1-9][0-9]{0,8}$' then (o.document ->> 'capacity')::integer end,
      'seats_taken', public.course_seats_taken(r.offering_id)
    ) order by r.created_at desc)
    from public.course_enrollment_requests r
    join auth.users u on u.id = r.user_id
    left join public.op_records o on o.collection = 'activity_offerings' and o.id = r.offering_id
    left join public.op_records d on d.collection = 'activity_definitions' and d.id = r.course_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_course_enrollment_requests() from public, anon, authenticated;
grant execute on function public.admin_list_course_enrollment_requests() to authenticated;

do $$
begin
  if not exists (select 1 from public.course_enrollment_payments) and not exists (select 1 from public.course_enrollment_payment_events) then
    drop table public.course_enrollment_payment_events;
    drop table public.course_enrollment_payments;
    drop function if exists public.course_payment_guard();
    drop function if exists public.course_payment_event_guard();
    if not exists (select 1 from public.course_enrollment_request_events where actor_kind = 'manual') then
      alter table public.course_enrollment_request_events drop constraint if exists course_enrollment_request_events_actor_kind_check;
      alter table public.course_enrollment_request_events add constraint course_enrollment_request_events_actor_kind_check
        check (actor_kind in ('aluno', 'administracao', 'servidor'));
    end if;
  else
    raise notice 'Ha recebimentos registrados: tabelas e trilha foram preservadas.';
  end if;
end;
$$;

commit;
