-- IA-01: limites de uso do Assistente Potala (rate limiting e teto de custo no backend).
--
-- O que guarda: só contadores. Nenhuma pergunta, resposta, IP ou dado pessoal.
--   * ia_uso_cliente: pedidos por visitante no minuto e no dia. "cliente" é um hash
--     diário (32 hex) calculado na Edge Function a partir do IP + segredo; o IP nunca
--     chega ao banco. Retenção: apagado depois de 1 dia.
--   * ia_uso_global: pedidos e tokens do dia, para o teto de custo. Sem dado pessoal.
--     Retenção: 30 dias (acompanhamento de consumo).
--
-- Quem acessa: ninguém pelo navegador. As tabelas não têm política nem grant para
-- anon/authenticated; as duas funções só são executáveis por service_role, usado
-- exclusivamente dentro da Edge Function assistente-potala.
--
-- Rollback: supabase/rollbacks/202611130001_rollback_ia_assistente_uso.sql.

begin;

create table if not exists public.ia_uso_cliente (
  cliente text not null check (cliente ~ '^[0-9a-f]{32}$'),
  dia date not null,
  minuto timestamptz not null,
  pedidos_minuto integer not null default 0 check (pedidos_minuto >= 0),
  pedidos_dia integer not null default 0 check (pedidos_dia >= 0),
  primary key (cliente, dia)
);

create table if not exists public.ia_uso_global (
  dia date primary key,
  pedidos integer not null default 0 check (pedidos >= 0),
  tokens bigint not null default 0 check (tokens >= 0)
);

alter table public.ia_uso_cliente enable row level security;
alter table public.ia_uso_global enable row level security;
revoke all on table public.ia_uso_cliente from public, anon, authenticated;
revoke all on table public.ia_uso_global from public, anon, authenticated;

-- Reserva um pedido: confere o teto global do dia (pedidos e tokens) e os limites do
-- visitante (por minuto e por dia). Recusa com PT503 (assistente pausado por cota) ou
-- PT429 (visitante acima do limite). Tudo numa transação, com trava de linha.
create or replace function public.ia_reservar_uso(
  p_cliente text, p_limite_minuto integer, p_limite_dia integer,
  p_limite_global integer, p_limite_tokens bigint
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_minuto timestamptz := date_trunc('minute', now());
  v_cliente public.ia_uso_cliente;
  v_global public.ia_uso_global;
begin
  if p_cliente is null or p_cliente !~ '^[0-9a-f]{32}$'
     or p_limite_minuto is null or p_limite_minuto not between 1 and 100
     or p_limite_dia is null or p_limite_dia not between 1 and 1000
     or p_limite_global is null or p_limite_global not between 1 and 100000
     or p_limite_tokens is null or p_limite_tokens not between 1000 and 100000000 then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;

  -- Retenção mínima.
  delete from public.ia_uso_cliente where dia < v_hoje - 1;
  delete from public.ia_uso_global where dia < v_hoje - 30;

  insert into public.ia_uso_global (dia) values (v_hoje) on conflict (dia) do nothing;
  select * into v_global from public.ia_uso_global where dia = v_hoje for update;
  if v_global.pedidos >= p_limite_global or v_global.tokens >= p_limite_tokens then
    raise exception 'Cota diária do assistente esgotada.' using errcode = 'PT503';
  end if;

  insert into public.ia_uso_cliente (cliente, dia, minuto) values (p_cliente, v_hoje, v_minuto)
    on conflict (cliente, dia) do nothing;
  select * into v_cliente from public.ia_uso_cliente where cliente = p_cliente and dia = v_hoje for update;
  if v_cliente.minuto <> v_minuto then
    v_cliente.minuto := v_minuto;
    v_cliente.pedidos_minuto := 0;
  end if;
  if v_cliente.pedidos_minuto >= p_limite_minuto or v_cliente.pedidos_dia >= p_limite_dia then
    raise exception 'Limite de perguntas atingido.' using errcode = 'PT429';
  end if;

  update public.ia_uso_cliente
     set minuto = v_cliente.minuto, pedidos_minuto = v_cliente.pedidos_minuto + 1, pedidos_dia = v_cliente.pedidos_dia + 1
   where cliente = p_cliente and dia = v_hoje;
  update public.ia_uso_global set pedidos = pedidos + 1 where dia = v_hoje;

  return jsonb_build_object('restantes_dia', p_limite_dia - v_cliente.pedidos_dia - 1);
end;
$$;

-- Soma os tokens efetivamente gastos (informados pela OpenAI) ao total do dia.
create or replace function public.ia_registrar_tokens(p_tokens integer)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_tokens is null or p_tokens not between 0 and 1000000 then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  insert into public.ia_uso_global (dia, tokens) values (v_hoje, p_tokens)
    on conflict (dia) do update set tokens = public.ia_uso_global.tokens + excluded.tokens;
end;
$$;

revoke all on function public.ia_reservar_uso(text, integer, integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.ia_registrar_tokens(integer) from public, anon, authenticated;
grant execute on function public.ia_reservar_uso(text, integer, integer, integer, bigint) to service_role;
grant execute on function public.ia_registrar_tokens(integer) to service_role;

commit;
