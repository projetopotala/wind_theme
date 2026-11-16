-- Reverte 202611160003: volta a fechar o pedido sem horario para contas autenticadas (estado de Production antes).
-- Pedidos ja feitos nao sao alterados. Nao mexe no historico de migrations.
begin;
revoke all on function public.submit_authenticated_appointment_request(uuid,text,text,date,text) from public, anon, authenticated;
commit;
