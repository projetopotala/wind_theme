-- =====================================================================
-- RASCUNHO — NÃO APLICAR. Proteção de CAPACIDADE das turmas no banco.
-- Exige `set potala.p1_aprovado = 'capacidade'`.
--
-- PROPOSTA SEPARADA da guarda operacional pendente (202610230001): não a
-- altera, não depende dela e pode ser aplicada antes ou depois. Também não
-- depende das PARTES 1 e 2 da P1, mas deve vir ANTES da PARTE 2 (cópia para o
-- Meu Potala), para que nenhuma inscrição acima da capacidade chegue ao aluno.
--
-- CONTRATO (tirado do painel, outputs/js/admin/operations/schedule.js):
--   * activity_offerings.capacity: inteiro >= 1 ou nulo (nulo = sem limite);
--   * ocupam vaga as inscrições 'active' e 'completed' (enrollment.save);
--     'waitlist' e 'cancelled' não ocupam;
--   * o banco garante a invariante:  ocupadas(turma) <= capacity(turma).
--
-- DIVERGÊNCIA DO PAINEL (não resolvida aqui, decisão pendente): ao REDUZIR a
-- capacidade, o painel conta também a lista de espera (offering.save conta
-- tudo que não é 'cancelled'); ao INSCREVER, não conta. O banco aplica a regra
-- comum às duas (só active + completed). O painel continua mais restritivo na
-- redução; nada muda para quem usa o painel.
--
-- COMO: um gatilho de restrição ADIADO (deferrable initially deferred) em
-- op_records. Ele roda no fim da transação de op_apply, quando TODAS as
-- mudanças do comando já estão gravadas — então reduzir a capacidade e
-- cancelar uma inscrição no mesmo comando é aceito, e o resultado final é o
-- que se verifica. Se a invariante falhar, a transação inteira é desfeita:
-- nem a inscrição, nem a auditoria, nem a revisão (op_meta) mudam.
--
-- O controle de versões do op_apply continua igual. A verificação também
-- pega a trava de op_meta, para que qualquer gravador (mesmo fora do
-- op_apply) entre na mesma fila antes de contar as vagas.
-- =====================================================================

do $trava$
begin
  if coalesce(current_setting('potala.p1_aprovado', true), '') <> 'capacidade' then
    raise exception 'RASCUNHO (capacidade das turmas): aplicação não autorizada nesta sessão.';
  end if;
end;
$trava$;

begin;

-- ---------------------------------------------------------------------
-- Não instalar sobre dados que já violam a regra (ver pré-checagem I e J):
-- a primeira edição dessas turmas passaria a ser recusada sem explicação.
-- ---------------------------------------------------------------------
do $dados$
begin
  if to_regclass('public.op_records') is null or to_regclass('public.op_meta') is null then
    raise exception 'Operação do Instituto não instalada.';
  end if;

  if exists (
    select 1 from public.op_records t
    where t.collection = 'activity_offerings'
      and jsonb_typeof(t.document -> 'capacity') is not null
      and jsonb_typeof(t.document -> 'capacity') <> 'null'
      and not (jsonb_typeof(t.document -> 'capacity') = 'number'
               and case when (t.document ->> 'capacity') ~ '^[0-9]{1,9}$'
                        then (t.document ->> 'capacity')::integer >= 1 else false end)
  ) then
    raise exception 'Há turmas com capacidade inválida. Corrija-as antes (pré-checagem J).';
  end if;

  if exists (
    select 1
    from public.op_records t
    where t.collection = 'activity_offerings'
      and jsonb_typeof(t.document -> 'capacity') = 'number'
      and (select count(*) from public.op_records e
           where e.collection = 'enrollments'
             and e.document ->> 'offering_id' = t.id
             and e.document ->> 'status' in ('active', 'completed'))
          > case when (t.document ->> 'capacity') ~ '^[0-9]{1,9}$' then (t.document ->> 'capacity')::integer end
  ) then
    raise exception 'Há turmas acima da capacidade. A secretaria precisa resolver antes (pré-checagem I).';
  end if;
end;
$dados$;

-- ---------------------------------------------------------------------
-- Verifica UMA turma no estado atual (dentro da transação).
-- ---------------------------------------------------------------------
create or replace function public.op_capacidade_verificar_turma(p_offering_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  turma jsonb;
  texto_capacidade text;
  capacidade integer;
  ocupadas integer;
begin
  if coalesce(p_offering_id, '') = '' then
    return;
  end if;

  select r.document into turma
  from public.op_records as r
  where r.collection = 'activity_offerings' and r.id = p_offering_id;

  -- Turma inexistente ou sem limite: não há vaga a proteger.
  if turma is null or jsonb_typeof(turma -> 'capacity') is null or jsonb_typeof(turma -> 'capacity') = 'null' then
    return;
  end if;

  if jsonb_typeof(turma -> 'capacity') <> 'number' then
    raise exception 'Capacidade inválida na oferta %.', p_offering_id using errcode = '22023';
  end if;
  texto_capacidade := turma ->> 'capacity';
  if texto_capacidade !~ '^[0-9]{1,9}$' then
    raise exception 'Capacidade inválida na oferta %.', p_offering_id using errcode = '22023';
  end if;
  capacidade := texto_capacidade::integer;
  if capacidade < 1 then
    raise exception 'Capacidade inválida na oferta %.', p_offering_id using errcode = '22023';
  end if;

  select count(*) into ocupadas
  from public.op_records as e
  where e.collection = 'enrollments'
    and e.document ->> 'offering_id' = p_offering_id
    and e.document ->> 'status' in ('active', 'completed');

  if ocupadas > capacidade then
    raise exception 'Capacidade da oferta esgotada.'
      using errcode = '23514',
            detail = format('Oferta %s: %s inscrições ativas ou concluídas para %s vagas.', p_offering_id, ocupadas, capacidade);
  end if;
end;
$$;
revoke all on function public.op_capacidade_verificar_turma(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Gatilho adiado: só olha o que pode AUMENTAR a ocupação ou REDUZIR o limite.
--   enrollments (insert/update): a turma de destino (troca de turma,
--     promoção da espera, nova inscrição, reinscrição);
--   activity_offerings (insert/update): a própria turma (redução de vagas).
-- Excluir ou cancelar só libera vagas: nada a verificar.
-- ---------------------------------------------------------------------
create or replace function public.op_records_capacidade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.op_meta as meta where meta.id = 1 for update;

  if new.collection = 'enrollments' then
    perform public.op_capacidade_verificar_turma(new.document ->> 'offering_id');
  elsif new.collection = 'activity_offerings' then
    perform public.op_capacidade_verificar_turma(new.id);
  end if;
  return null;
end;
$$;
revoke all on function public.op_records_capacidade() from public, anon, authenticated;

drop trigger if exists op_records_capacidade on public.op_records;
create constraint trigger op_records_capacidade
  after insert or update on public.op_records
  deferrable initially deferred
  for each row
  when (new.collection in ('enrollments', 'activity_offerings'))
  execute function public.op_records_capacidade();

commit;
