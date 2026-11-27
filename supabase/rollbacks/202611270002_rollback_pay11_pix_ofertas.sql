-- PAY-11 rollback: fecha o modo por oferta e restaura a autorizacao exclusiva do piloto.
drop function if exists public.admin_set_pay_offering_policy(text,boolean,boolean);
drop function if exists public.pay_my_appointment_payment_options();
drop function if exists public.pay_normal_offering_authorized(uuid,uuid);
drop trigger if exists pay_guard_cancelled_appointment on public.op_records;
drop function if exists public.pay_guard_cancelled_appointment();
create or replace function public.pay_charge_allowed(p_user_id uuid,p_request_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.pay_charges_enabled() and public.pay_pilot_authorized(p_user_id,p_request_id)
$$;
revoke all on function public.pay_charge_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pay_charge_allowed(uuid,uuid) to service_role;
-- Preserva configuracoes para recuperacao/auditoria, mas fecha todas as ofertas.
update public.pay_offering_policies set enabled=false,updated_at=now();

-- Restaura a listagem PAY-10 sem depender da politica PAY-11.
create or replace function public.admin_list_appointment_service_prices() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not public.course_payment_is_owner() then raise exception 'Somente o Owner administra precos de atendimentos.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('offering_id',o.id,'title',coalesce(nullif(btrim(o.document->>'title'),''),o.id),
    'published',coalesce((o.document->>'published')::boolean,false),'professional_name',coalesce(nullif(btrim(p.document->>'display_name'),''),'Profissional nao identificado'),
    'professional_eligible',p.id is not null and coalesce((p.document->>'active')::boolean,true) and coalesce((p.document->>'published')::boolean,false) and coalesce(p.document->'roles','[]'::jsonb)?'professional',
    'test_or_demo',public.pay_admin_offering_is_test(o.document,p.document),'amount_cents',sp.amount_cents,'currency',coalesce(sp.currency,'BRL'),
    'price_active',coalesce(sp.active,false),'updated_at',sp.updated_at)
    order by lower(coalesce(nullif(btrim(o.document->>'title'),''),o.id))),'[]'::jsonb) into v_result
  from public.op_records o left join public.op_records p on p.collection='profiles' and p.id=nullif(btrim(o.document->>'professional_id'),'')
  left join public.appointment_service_prices sp on sp.offering_id=o.id
  where o.collection='activity_offerings' and coalesce((o.document->>'active')::boolean,true);
  return v_result;
end;
$$;
