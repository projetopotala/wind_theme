-- Rode UM bloco por vez. Retomar só depois de chamada manual autenticada com
-- resposta contendo `asaas_autenticado: true`.

-- RETOMAR:
select cron.alter_job(
  (select jobid from cron.job where jobname = 'potala-pay-reconcile-v1'),
  active := true
);

-- PAUSAR (não afeta webhook nem cobranças já existentes):
select cron.alter_job(
  (select jobid from cron.job where jobname = 'potala-pay-reconcile-v1'),
  active := false
);

-- VERIFICAR. `cron.job_run_details` confirma o disparo; pg_net é assíncrono,
-- portanto o HTTP final deve ser conferido também nos logs da Edge Function.
select jobname, schedule, active
  from cron.job where jobname = 'potala-pay-reconcile-v1';
select status, return_message, start_time, end_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'potala-pay-reconcile-v1')
 order by start_time desc limit 5;
-- Não exibe corpos de resposta, que podem pertencer a outras integrações.
select status_code, error_msg, created
  from net._http_response
 where created >= coalesce(
   (select max(start_time) from cron.job_run_details
     where jobid = (select jobid from cron.job where jobname = 'potala-pay-reconcile-v1')),
   now() - interval '10 minutes')
 order by created desc limit 5;

-- REMOVER (operação destrutiva; somente com autorização específica):
-- select cron.unschedule('potala-pay-reconcile-v1');
-- delete from vault.secrets where name = 'potala_pay_reconcile_token';
