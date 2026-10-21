-- Autoriza somente a Edge Function a usar a RPC já instalada.
-- Aplicar apenas depois de conciliar o histórico da migration anterior.
begin;
revoke execute on function public.submit_appointment_request(uuid,text,text,text,text,text,date,text)
  from public, anon, authenticated;
grant execute on function public.submit_appointment_request(uuid,text,text,text,text,text,date,text)
  to service_role;
do $$
begin
  if has_function_privilege('anon', 'public.submit_appointment_request(uuid,text,text,text,text,text,date,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.submit_appointment_request(uuid,text,text,text,text,text,date,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.submit_appointment_request(uuid,text,text,text,text,text,date,text)', 'EXECUTE') then
    raise exception 'Privilégios efetivos inesperados para a RPC de atendimento';
  end if;
end;
$$;
commit;
