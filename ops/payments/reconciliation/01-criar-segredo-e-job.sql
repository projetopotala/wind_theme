-- PREPARADO, NAO APLICADO. Executar somente após autorização do Owner.
-- Requer psql: PAY_RECONCILE_TOKEN entra por \getenv e nunca fica neste arquivo.
\set ON_ERROR_STOP on
\set tok ''
\getenv tok PAY_RECONCILE_TOKEN
select (:'tok' <> '' and length(:'tok') >= 32 and :'tok' !~ '[[:space:]]') as token_recebido_ok \gset
\if :token_recebido_ok
\else
  \echo 'PAY_RECONCILE_TOKEN ausente, curto ou com espaco: nada foi feito.'
  \quit 3
\endif

-- Falha antes de qualquer escrita se a infraestrutura esperada não existir.
select (to_regnamespace('cron') is not null
  and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null
  and to_regclass('vault.secrets') is not null
  and to_regclass('vault.decrypted_secrets') is not null) as infraestrutura_ok \gset
\if :infraestrutura_ok
\else
  \echo 'pg_cron, pg_net ou Vault incompatível/ausente: nada foi feito.'
  \quit 4
\endif

-- Em reaplicação, pause primeiro um job já existente. Uma execução que já tenha
-- começado não é abortada; aguarde sua conclusão antes de continuar.
do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname = 'potala-pay-reconcile-v1';
  if j is not null then perform cron.alter_job(j, active := false); end if;
end $$;

begin;
select vault.create_secret(:'tok', 'potala_pay_reconcile_token',
  'x-reconcile-token do reconciliador de pagamentos (PAY)')
 where not exists (select 1 from vault.secrets where name = 'potala_pay_reconcile_token');
select vault.update_secret(id, :'tok')
  from vault.secrets where name = 'potala_pay_reconcile_token';

select cron.schedule(
  'potala-pay-reconcile-v1',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://gotrumwuimpoeggwamut.supabase.co/functions/v1/reconcile-appointment-payments',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reconcile-token', (select decrypted_secret from vault.decrypted_secrets
          where name = 'potala_pay_reconcile_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
select cron.alter_job(
  (select jobid from cron.job where jobname = 'potala-pay-reconcile-v1'),
  active := false
);
commit;

select jobname, schedule, active
  from cron.job where jobname = 'potala-pay-reconcile-v1';
