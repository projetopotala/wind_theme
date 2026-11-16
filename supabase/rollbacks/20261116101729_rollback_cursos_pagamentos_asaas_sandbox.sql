-- Rollback seguro da PR C. Eventos financeiros nunca sao apagados.
-- Se ja houver qualquer Checkout/evento, desativa as APIs e preserva as tabelas
-- para auditoria e recuperacao. Sem historico, remove apenas os objetos da PR C.
begin;
revoke all on function public.prepare_course_payment_checkout(uuid,uuid) from public,anon,authenticated;
revoke all on function public.register_course_payment_checkout(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.fail_course_payment_checkout(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.process_course_payment_webhook(jsonb) from public,anon,authenticated,service_role;

do $guard$
begin
  if to_regclass('public.course_payment_checkouts') is null then return; end if;
  if exists(select 1 from public.course_payment_checkouts)
    or exists(select 1 from public.course_payment_webhook_events) then
    revoke all on table public.course_payment_checkouts,public.course_payment_webhook_events from public,anon,authenticated;
    raise notice 'Historico financeiro preservado; mantenha as Edge Functions despublicadas e aplique uma migration corretiva.';
  else
    drop table public.course_payment_webhook_events;
    drop table public.course_payment_checkouts;
    drop function if exists public.process_course_payment_webhook(jsonb);
    drop function if exists public.fail_course_payment_checkout(uuid,text);
    drop function if exists public.register_course_payment_checkout(uuid,text,text);
    drop function if exists public.prepare_course_payment_checkout(uuid,uuid);
  end if;
end;
$guard$;
commit;
