-- Rollback da IA-01 (202611130001). Remove só os contadores de uso do assistente.
-- Efeito: a Edge Function assistente-potala passa a responder "indisponível" (fail-closed),
-- porque não consegue reservar uso. Nenhuma outra tabela muda.
begin;
drop function if exists public.ia_registrar_tokens(integer);
drop function if exists public.ia_reservar_uso(text, integer, integer, integer, bigint);
drop table if exists public.ia_uso_cliente;
drop table if exists public.ia_uso_global;
commit;
