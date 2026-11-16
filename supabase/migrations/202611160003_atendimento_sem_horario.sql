-- Ativa o pedido de atendimento SEM horario para contas autenticadas.
--
-- 202610210001 deixou submit_authenticated_appointment_request sem EXECUTE para authenticated e registrou:
-- "Uma futura ativacao exige uma migration especifica e revisada que conceda EXECUTE a authenticated."
-- Esta e essa migration. Ela so concede EXECUTE; nao muda o corpo da funcao, tabelas, politicas ou dados.
--
-- O que continua garantido pela propria funcao e pela cadeia que ela chama (submit_appointment_request):
--   * identidade vem de auth.uid() (sessao); nome e contato vem da conta, nao do navegador;
--   * exige e-mail confirmado (42501) e limita a frequencia de pedidos (PT429);
--   * so aceita oferta ativa cuja atividade e do tipo atendimento, com a modalidade da oferta;
--   * idempotencia pela chave; o pedido nasce "recebida", sem horario nem consulta marcada.
-- Anonimo continua sem acesso (o recebimento anonimo segue pela Edge Function, desligada).
-- Reversao: supabase/rollbacks/202611160003_rollback_atendimento_sem_horario.sql.

begin;
revoke all on function public.submit_authenticated_appointment_request(uuid,text,text,date,text) from public, anon;
grant execute on function public.submit_authenticated_appointment_request(uuid,text,text,date,text) to authenticated;
commit;
