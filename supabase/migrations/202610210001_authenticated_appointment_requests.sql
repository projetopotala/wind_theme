-- Solicitações autenticadas e acompanhamento no Meu Potala.
--
-- Reutiliza os perfis, ofertas e profissionais da operação do Instituto. Esta
-- migration não cria consultas nem horários: a solicitação continua sendo uma
-- intenção até a recepção confirmar e criar o compromisso operacional.
begin;

do $$
begin
  if to_regclass('public.appointment_requests') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.op_records') is null
    or to_regprocedure('public.is_portal_admin()') is null
    or to_regprocedure('public.submit_appointment_request(uuid,text,text,text,text,text,date,text)') is null then
    raise exception 'Dependências de atendimento, conta ou operação não instaladas.';
  end if;
end;
$$;

alter table public.appointment_requests
  add column requester_user_id uuid references auth.users (id) on delete set null,
  add column offering_id text,
  add column professional_profile_id text;

create index appointment_requests_requester_idx
  on public.appointment_requests (requester_user_id, created_at desc)
  where requester_user_id is not null;
create index appointment_requests_professional_idx
  on public.appointment_requests (professional_profile_id, created_at desc)
  where professional_profile_id is not null;

-- Faz a ponte entre uma identidade do Auth e o cadastro operacional existente.
-- Não duplica o perfil do profissional nem concede acesso ao painel inteiro.
create table public.appointment_profile_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile_id text not null unique check (char_length(profile_id) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointment_profile_accounts enable row level security;
revoke all on table public.appointment_profile_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.appointment_profile_accounts to authenticated;

create policy appointment_profile_accounts_admin_read on public.appointment_profile_accounts
  for select to authenticated using ((select public.is_portal_admin()));
create policy appointment_profile_accounts_admin_insert on public.appointment_profile_accounts
  for insert to authenticated with check ((select public.is_portal_admin()));
create policy appointment_profile_accounts_admin_update on public.appointment_profile_accounts
  for update to authenticated
  using ((select public.is_portal_admin())) with check ((select public.is_portal_admin()));
create policy appointment_profile_accounts_admin_delete on public.appointment_profile_accounts
  for delete to authenticated using ((select public.is_portal_admin()));

create function public.is_appointment_professional(p_profile_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.appointment_profile_accounts as conta
    join public.op_records as perfil
      on perfil.collection = 'profiles' and perfil.id = conta.profile_id
    where conta.user_id = (select auth.uid())
      and conta.profile_id = p_profile_id
      and conta.active = true
      and coalesce(perfil.document -> 'roles', '[]'::jsonb) ? 'professional'
  );
$$;
revoke all on function public.is_appointment_professional(text) from public, anon;
grant execute on function public.is_appointment_professional(text) to authenticated;

-- O cliente vê somente os próprios pedidos; o profissional, somente os que já
-- foram associados ao seu perfil operacional. A política administrativa da
-- F2.2 continua cobrindo recepção/administradores ativos.
create policy appointment_requests_client_read on public.appointment_requests
  for select to authenticated using (requester_user_id = (select auth.uid()));
create policy appointment_requests_professional_read on public.appointment_requests
  for select to authenticated using (
    professional_profile_id is not null
    and (select public.is_appointment_professional(professional_profile_id))
  );

-- Catálogo mínimo e sem contatos pessoais para montar o formulário autenticado.
create function public.list_appointment_offerings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then '[]'::jsonb else coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oferta.id,
      'service', coalesce(definicao.document ->> 'title', oferta.document ->> 'title'),
      'professional', profissional.document ->> 'display_name',
      'modality', coalesce(oferta.document ->> 'mode', 'presencial')
    ) order by coalesce(definicao.document ->> 'title', oferta.document ->> 'title'), oferta.id
  ), '[]'::jsonb) end
  from public.op_records as oferta
  join public.op_records as definicao
    on definicao.collection = 'activity_definitions'
   and definicao.id = oferta.document ->> 'definition_id'
  join lateral (
    select coalesce(
      oferta.document ->> 'professional_id',
      (select vinculo.document ->> 'professional_id'
       from public.op_records as vinculo
       where vinculo.collection = 'offering_professionals'
         and vinculo.document ->> 'offering_id' = oferta.id
         and coalesce((vinculo.document ->> 'active')::boolean, true)
       order by vinculo.ordem limit 1)
    ) as id
  ) as responsavel on responsavel.id is not null
  join public.op_records as profissional
    on profissional.collection = 'profiles' and profissional.id = responsavel.id
  where oferta.collection = 'activity_offerings'
    and coalesce((oferta.document ->> 'active')::boolean, true)
    and coalesce(profissional.document -> 'roles', '[]'::jsonb) ? 'professional';
$$;
revoke all on function public.list_appointment_offerings() from public, anon;
grant execute on function public.list_appointment_offerings() to authenticated;

-- Entrada autenticada. Nome e contato vêm do Auth/perfil, não do navegador.
-- A RPC da F2.2 continua sendo a única rotina que valida, limita e persiste o
-- pedido; esta camada apenas resolve a oferta/profissional e registra o dono.
create function public.submit_authenticated_appointment_request(
  p_idempotency_key uuid,
  p_offering_id text,
  p_modality text,
  p_preferred_date date,
  p_preferred_period text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  offering public.op_records%rowtype;
  definition public.op_records%rowtype;
  professional_id text;
  requester_name text;
  requester_email text;
  receipt jsonb;
  request_id uuid;
  existing public.appointment_requests%rowtype;
  already_existed boolean := false;
begin
  if requester_id is null then
    raise exception 'Entre no Meu Potala para solicitar atendimento.' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_offering_id is null or btrim(p_offering_id) = '' then
    raise exception 'Revise os campos da solicitação.' using errcode = '22023';
  end if;

  select * into offering from public.op_records
   where collection = 'activity_offerings' and id = p_offering_id
     and coalesce((document ->> 'active')::boolean, true);
  if not found then
    raise exception 'Serviço indisponível.' using errcode = '22023';
  end if;
  select * into definition from public.op_records
   where collection = 'activity_definitions' and id = offering.document ->> 'definition_id';
  if not found then
    raise exception 'Serviço indisponível.' using errcode = '22023';
  end if;

  professional_id := offering.document ->> 'professional_id';
  if professional_id is null then
    select vinculo.document ->> 'professional_id' into professional_id
    from public.op_records as vinculo
    where vinculo.collection = 'offering_professionals'
      and vinculo.document ->> 'offering_id' = offering.id
      and coalesce((vinculo.document ->> 'active')::boolean, true)
    order by vinculo.ordem limit 1;
  end if;
  if professional_id is null or not exists (
    select 1 from public.op_records as perfil
    where perfil.collection = 'profiles' and perfil.id = professional_id
      and coalesce(perfil.document -> 'roles', '[]'::jsonb) ? 'professional'
  ) then
    raise exception 'Serviço sem profissional habilitado.' using errcode = '22023';
  end if;

  select left(coalesce(nullif(btrim(perfil.display_name), ''), nullif(btrim(usuario.raw_user_meta_data ->> 'full_name'), ''), split_part(usuario.email, '@', 1)), 100),
         lower(usuario.email)
    into requester_name, requester_email
  from auth.users as usuario
  left join public.profiles as perfil on perfil.id = usuario.id
  where usuario.id = requester_id;
  if requester_email is null then
    raise exception 'Conta sem contato confirmado.' using errcode = '22023';
  end if;

  select * into existing from public.appointment_requests
    where idempotency_key = p_idempotency_key;
  already_existed := found;
  if found and (existing.requester_user_id is distinct from requester_id
    or existing.offering_id is distinct from offering.id
    or existing.professional_profile_id is distinct from professional_id) then
    raise exception 'Chave de solicitação reutilizada com outros dados.' using errcode = 'PT409';
  end if;

  receipt := public.submit_appointment_request(
    p_idempotency_key,
    coalesce(definition.document ->> 'title', offering.document ->> 'title'),
    p_modality,
    requester_name,
    'email',
    requester_email,
    p_preferred_date,
    p_preferred_period
  );
  request_id := (receipt ->> 'id')::uuid;

  -- Uma repetição idempotente não toca updated_at nem muda a associação.
  if already_existed then
    return receipt;
  end if;

  update public.appointment_requests as request
     set requester_user_id = requester_id,
         offering_id = offering.id,
         professional_profile_id = professional_id
   where request.id = request_id
     and (request.requester_user_id is null or request.requester_user_id = requester_id)
     and (request.offering_id is null or request.offering_id = offering.id)
     and (request.professional_profile_id is null or request.professional_profile_id = professional_id);
  if not found then
    raise exception 'A solicitação mudou. Tente novamente.' using errcode = 'PT409';
  end if;
  return receipt;
end;
$$;
revoke all on function public.submit_authenticated_appointment_request(uuid,text,text,date,text)
  from public, anon;
grant execute on function public.submit_authenticated_appointment_request(uuid,text,text,date,text)
  to authenticated;

commit;
