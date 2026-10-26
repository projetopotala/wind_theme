-- =====================================================================
-- RASCUNHO — NÃO APLICAR. P1 inscrições, PARTE 1: ESTRUTURA.
--
-- Fica fora de supabase/migrations de propósito: nenhuma ferramenta o aplica.
-- Mesmo colado no SQL Editor, ele PARA na primeira instrução, a menos que a
-- sessão declare `set potala.p1_aprovado = 'estrutura'` — o que só deve
-- acontecer depois da aprovação formal (README.md desta pasta).
--
-- Esta parte NÃO instala nenhum gatilho de cópia para o Meu Potala. Sozinha,
-- ela não faz nenhuma inscrição aparecer para ninguém.
--
-- Conteúdo:
--   1. site_interests.user_id preenchido pelo banco (nunca pelo cliente)
--   2. public.enrollments: rastreio da origem e ocultação sem apagar dados
--   3. public.op_profile_accounts: vínculo Pessoa do painel ↔ conta,
--      somente a partir de um pedido de curso feito por aquela conta
--   4. unicidade de (pessoa, turma) nas inscrições do painel
-- =====================================================================

do $trava$
begin
  if coalesce(current_setting('potala.p1_aprovado', true), '') <> 'estrutura' then
    raise exception 'RASCUNHO P1 (estrutura): aplicação não autorizada nesta sessão.';
  end if;
end;
$trava$;

begin;

-- ---------------------------------------------------------------------
-- 0. Dependências
-- ---------------------------------------------------------------------
do $dependencias$
begin
  if to_regclass('public.site_interests') is null
    or to_regclass('public.enrollments') is null
    or to_regclass('public.course_progress') is null
    or to_regclass('public.op_records') is null
    or to_regclass('public.op_meta') is null
    or to_regprocedure('public.is_portal_admin()') is null
    or to_regprocedure('auth.uid()') is null then
    raise exception 'Dependências da P1 ausentes (conta do visitante, participação ou operação).';
  end if;

  -- O índice da seção 4 falharia com duplicatas já existentes. Melhor parar
  -- aqui com uma mensagem clara (ver 00_prechecagem_somente_leitura.sql, C).
  if exists (
    select 1
    from public.op_records r
    where r.collection = 'enrollments'
    group by r.document ->> 'profile_id', r.document ->> 'offering_id'
    having count(*) > 1
  ) then
    raise exception 'Há inscrições do painel duplicadas para a mesma pessoa e turma. Trate-as antes (prechecagem C).';
  end if;
end;
$dependencias$;

-- ---------------------------------------------------------------------
-- 1. Pedido identificado
--
-- A identidade vem SEMPRE da sessão. Três barreiras, cada uma suficiente:
--   a) a coluna user_id NÃO entra no GRANT de insert (o cliente nem consegue
--      nomeá-la: 42501, inclusive para mandar null);
--   b) um gatilho BEFORE INSERT sobrescreve qualquer valor com auth.uid();
--   c) a política de INSERT exige user_id IS NOT DISTINCT FROM auth.uid().
-- Anônimo continua podendo enviar interesse (user_id fica nulo). Os quatro
-- campos que o site manda hoje (kind, subject, details, page) não mudam.
-- ---------------------------------------------------------------------
alter table public.site_interests
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists site_interests_user_idx
  on public.site_interests (user_id) where user_id is not null;

create or replace function public.site_interests_identidade_da_sessao()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.user_id := (select auth.uid());
  return new;
end;
$$;
revoke all on function public.site_interests_identidade_da_sessao() from public, anon, authenticated;

drop trigger if exists site_interests_identidade_da_sessao on public.site_interests;
create trigger site_interests_identidade_da_sessao
  before insert on public.site_interests
  for each row execute function public.site_interests_identidade_da_sessao();

-- Os grants de site_interests NÃO mudam: insert (kind, subject, details, page)
-- para anon e authenticated, como em 202609170002.
drop policy if exists "visitante envia interesse" on public.site_interests;
create policy "visitante envia interesse" on public.site_interests
  for insert to anon, authenticated
  with check (
    kind in ('curso', 'experiencia-cultural', 'retorno-recepcao')
    and user_id is not distinct from (select auth.uid())
  );

-- ---------------------------------------------------------------------
-- 2. public.enrollments: origem rastreável e ocultação sem perda de dados
--
-- Nenhuma linha é apagada pelo fluxo do painel. Cancelar, remover, trocar de
-- turma ou desvincular apenas OCULTA a cópia (hidden_at), e o progresso em
-- course_progress continua guardado. Mostrar "Cancelada" ao aluno, em vez
-- de ocultar, é decisão do Instituto (README, decisão 4).
-- ---------------------------------------------------------------------
alter table public.enrollments
  add column if not exists op_enrollment_id text
    check (op_enrollment_id is null or char_length(op_enrollment_id) between 1 and 160),
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text
    check (hidden_reason is null or hidden_reason in ('cancelada', 'removida', 'trocada', 'reatribuida', 'desvinculada'));

do $consistencia$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'enrollments_ocultacao_consistente'
      and conrelid = 'public.enrollments'::regclass
  ) then
    alter table public.enrollments
      add constraint enrollments_ocultacao_consistente
      check ((hidden_at is null) = (hidden_reason is null));
  end if;
end;
$consistencia$;

-- No máximo UMA cópia visível por inscrição do painel.
create unique index if not exists enrollments_op_visivel_unica
  on public.enrollments (op_enrollment_id)
  where op_enrollment_id is not null and hidden_at is null;

-- O aluno deixa de ver o que foi ocultado (e o progresso dele).
-- Sem linhas ocultas, o comportamento é idêntico ao de hoje.
drop policy if exists "visitante le as proprias inscricoes" on public.enrollments;
create policy "visitante le as proprias inscricoes" on public.enrollments
  for select to authenticated
  using ((select auth.uid()) = user_id and hidden_at is null);

drop policy if exists "visitante le o proprio progresso" on public.course_progress;
create policy "visitante le o proprio progresso" on public.course_progress
  for select to authenticated
  using (exists (
    select 1
    from public.enrollments
    where enrollments.id = course_progress.enrollment_id
      and enrollments.user_id = (select auth.uid())
      and enrollments.hidden_at is null
  ));

-- Os grants de enrollments e course_progress NÃO mudam (só SELECT).

-- ---------------------------------------------------------------------
-- 3. Vínculo Pessoa do painel ↔ conta do portal
--
-- O cliente informa SOMENTE (op_profile_id, interest_id). A conta é tirada
-- do pedido, pelo banco. Não há UPDATE: corrigir = excluir e vincular de novo.
-- Nesta versão só existe a origem 'pedido'; código de vínculo não existe.
-- ---------------------------------------------------------------------
create table if not exists public.op_profile_accounts (
  op_profile_id text primary key check (char_length(op_profile_id) between 1 and 160),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  source text not null default 'pedido' check (source = 'pedido'),
  interest_id uuid references public.site_interests (id) on delete set null,
  linked_by uuid not null,
  linked_at timestamptz not null default now()
);

alter table public.op_profile_accounts enable row level security;
revoke all on table public.op_profile_accounts from public, anon, authenticated;
grant select, delete on table public.op_profile_accounts to authenticated;
grant insert (op_profile_id, interest_id) on table public.op_profile_accounts to authenticated;

drop policy if exists "administracao le vinculos" on public.op_profile_accounts;
create policy "administracao le vinculos" on public.op_profile_accounts
  for select to authenticated using ((select public.is_portal_admin()));

drop policy if exists "administracao cria vinculos" on public.op_profile_accounts;
create policy "administracao cria vinculos" on public.op_profile_accounts
  for insert to authenticated with check ((select public.is_portal_admin()));

drop policy if exists "administracao desfaz vinculos" on public.op_profile_accounts;
create policy "administracao desfaz vinculos" on public.op_profile_accounts
  for delete to authenticated using ((select public.is_portal_admin()));

drop policy if exists "aluno ve o proprio vinculo" on public.op_profile_accounts;
create policy "aluno ve o proprio vinculo" on public.op_profile_accounts
  for select to authenticated using (user_id = (select auth.uid()));

-- Validação do vínculo. SECURITY DEFINER porque precisa ler op_records, que
-- não tem grant a ninguém. Não recebe argumentos do cliente além da linha.
create or replace function public.op_profile_accounts_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pedido record;
begin
  if not public.is_portal_admin() then
    raise exception 'Somente a administração do Instituto vincula contas.' using errcode = '42501';
  end if;

  if new.interest_id is null then
    raise exception 'O vínculo precisa partir de um pedido.' using errcode = '23502';
  end if;

  select i.id, i.kind, i.user_id into pedido
  from public.site_interests as i
  where i.id = new.interest_id;

  if not found then
    raise exception 'Pedido inexistente.' using errcode = '23503';
  end if;
  if pedido.kind <> 'curso' then
    raise exception 'Somente pedidos de curso permitem vínculo.' using errcode = '22023';
  end if;
  if pedido.user_id is null then
    raise exception 'Pedido sem conta: não há identidade comprovada para vincular.' using errcode = '22023';
  end if;

  -- Põe o vínculo na mesma fila das gravações do painel (op_apply trava esta
  -- linha), para que inscrição e vínculo simultâneos não se percam.
  perform 1 from public.op_meta as meta where meta.id = 1 for update;

  if not exists (
    select 1 from public.op_records as r
    where r.collection = 'profiles' and r.id = new.op_profile_id
  ) then
    raise exception 'Pessoa inexistente no painel.' using errcode = '23503';
  end if;

  new.user_id := pedido.user_id;
  new.source := 'pedido';
  new.linked_by := (select auth.uid());
  new.linked_at := now();
  return new;
end;
$$;
revoke all on function public.op_profile_accounts_validar() from public, anon, authenticated;

drop trigger if exists op_profile_accounts_validar on public.op_profile_accounts;
create trigger op_profile_accounts_validar
  before insert on public.op_profile_accounts
  for each row execute function public.op_profile_accounts_validar();

-- ---------------------------------------------------------------------
-- 4. Uma inscrição por (pessoa, turma) no painel
--
-- Igual à regra que o painel já aplica no navegador (enrollment.save recusa
-- qualquer segunda inscrição da mesma pessoa na mesma oferta, inclusive
-- cancelada; reinscrever = editar a existente). Documentos sem pessoa ou sem
-- turma (nulos) não colidem entre si — o painel não os produz.
-- ---------------------------------------------------------------------
create unique index if not exists op_records_enrollment_pessoa_turma
  on public.op_records ((document ->> 'profile_id'), (document ->> 'offering_id'))
  where collection = 'enrollments';

commit;
