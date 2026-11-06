-- OPERACAO MANUAL, SOMENTE LAB (hmspabllgxqfzzricijv). NAO e migration: nunca aplicar em producao.
-- Pre-requisitos (feitos fora do Git, sem imprimir o valor):
--   1) Secret da funcao:  supabase secrets set SWEEPER_SECRET=<valor aleatorio >= 32 caracteres> --project-ref hmspabllgxqfzzricijv
--   2) Mesmo valor no Vault: select vault.create_secret('<valor>', 'sweeper_secret', 'credencial do varredor D4');
-- Habilita pg_net e pg_cron e agenda o varredor a cada minuto, lendo a credencial do Vault em tempo de execucao.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'sweeper_secret') then
    raise exception 'Crie o segredo sweeper_secret no Vault antes de agendar.';
  end if;
end $$;

select cron.schedule(
  'd4-sweep-appointment-rooms',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://hmspabllgxqfzzricijv.supabase.co/functions/v1/sweep-appointment-rooms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweeper-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sweeper_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);

-- Parar:        select cron.unschedule('d4-sweep-appointment-rooms');
-- Acompanhar:   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
--               select id, status_code, left(content, 120) as resposta, created from net._http_response order by created desc limit 10;
