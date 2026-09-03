begin;

create table if not exists public.home_blocks (
  id text primary key,
  slug text not null unique,
  category text not null default '',
  title text not null,
  summary text not null default '',
  body text not null default '',
  image text not null default '',
  icon text not null default '',
  tags text[] not null default '{}',
  href text not null default '#',
  side text not null check (side in ('left', 'right')),
  position integer not null check (position >= 0),
  published boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists home_blocks_published_position_idx
  on public.home_blocks (published, position);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_blocks enable row level security;
alter table public.admin_users enable row level security;

revoke all on table public.home_blocks from anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;

grant select on table public.home_blocks to anon;
grant select, insert, update, delete on table public.home_blocks to authenticated;
grant select on table public.admin_users to authenticated;

create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.admin_users
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    );
$$;

revoke all on function public.is_portal_admin() from public;
grant execute on function public.is_portal_admin() to authenticated;

drop policy if exists "public can read published home blocks" on public.home_blocks;
create policy "public can read published home blocks"
on public.home_blocks
for select
to anon
using (published = true);

drop policy if exists "signed in visitors can read published home blocks" on public.home_blocks;
create policy "signed in visitors can read published home blocks"
on public.home_blocks
for select
to authenticated
using (published = true);

drop policy if exists "admins can read all home blocks" on public.home_blocks;
create policy "admins can read all home blocks"
on public.home_blocks
for select
to authenticated
using ((select public.is_portal_admin()));

drop policy if exists "admins can insert home blocks" on public.home_blocks;
create policy "admins can insert home blocks"
on public.home_blocks
for insert
to authenticated
with check ((select public.is_portal_admin()));

drop policy if exists "admins can update home blocks" on public.home_blocks;
create policy "admins can update home blocks"
on public.home_blocks
for update
to authenticated
using ((select public.is_portal_admin()))
with check ((select public.is_portal_admin()));

drop policy if exists "admins can delete home blocks" on public.home_blocks;
create policy "admins can delete home blocks"
on public.home_blocks
for delete
to authenticated
using ((select public.is_portal_admin()));

drop policy if exists "admins can read their own portal role" on public.admin_users;
create policy "admins can read their own portal role"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.replace_home_blocks(payload jsonb)
returns setof public.home_blocks
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'portal_admin_required' using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'home_blocks_payload_must_be_an_array' using errcode = '22023';
  end if;

  if jsonb_array_length(payload) > 200 then
    raise exception 'home_blocks_payload_too_large' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.portal_home_blocks_input (
    id text primary key,
    slug text not null unique,
    category text not null,
    title text not null,
    summary text not null,
    body text not null,
    image text not null,
    icon text not null,
    tags text[] not null,
    href text not null,
    side text not null check (side in ('left', 'right')),
    position integer not null check (position >= 0),
    published boolean not null,
    updated_at timestamptz not null
  ) on commit drop;

  delete from pg_temp.portal_home_blocks_input where true;

  insert into pg_temp.portal_home_blocks_input (
    id, slug, category, title, summary, body, image, icon,
    tags, href, side, position, published, updated_at
  )
  select
    nullif(btrim(record.id), ''),
    nullif(btrim(record.slug), ''),
    coalesce(record.category, ''),
    nullif(btrim(record.title), ''),
    coalesce(record.summary, ''),
    coalesce(record.body, ''),
    coalesce(record.image, ''),
    coalesce(record.icon, ''),
    coalesce(record.tags, '{}'),
    coalesce(nullif(btrim(record.href), ''), '#'),
    record.side,
    record.position,
    coalesce(record.published, true),
    coalesce(record.updated_at, now())
  from jsonb_to_recordset(payload) as record (
    id text,
    slug text,
    category text,
    title text,
    summary text,
    body text,
    image text,
    icon text,
    tags text[],
    href text,
    side text,
    position integer,
    published boolean,
    updated_at timestamptz
  );

  insert into public.home_blocks (
    id, slug, category, title, summary, body, image, icon,
    tags, href, side, position, published, updated_at
  )
  select
    id, slug, category, title, summary, body, image, icon,
    tags, href, side, position, published, updated_at
  from pg_temp.portal_home_blocks_input
  on conflict (id) do update set
    slug = excluded.slug,
    category = excluded.category,
    title = excluded.title,
    summary = excluded.summary,
    body = excluded.body,
    image = excluded.image,
    icon = excluded.icon,
    tags = excluded.tags,
    href = excluded.href,
    side = excluded.side,
    position = excluded.position,
    published = excluded.published,
    updated_at = excluded.updated_at;

  delete from public.home_blocks
  where not exists (
    select 1
    from pg_temp.portal_home_blocks_input incoming
    where incoming.id = home_blocks.id
  );

  return query
  select blocks.*
  from public.home_blocks blocks
  order by blocks.position, blocks.id;
end;
$$;

revoke all on function public.replace_home_blocks(jsonb) from public;
grant execute on function public.replace_home_blocks(jsonb) to authenticated;

insert into public.home_blocks (
  id, slug, category, title, summary, body, image, icon,
  tags, href, side, position, published
)
values
  ('quem-somos', 'quem-somos', 'A entrada', 'Quem somos',
   'Um instituto feito de pessoas, histórias e muitos modos de cuidar.',
   'Conheça a visão que reúne cuidado, conhecimento, cultura e convivência em um mesmo ecossistema humano.',
   '', '', array['história', 'propósito', 'comunidade'], 'quem-somos.html', 'left', 0, true),
  ('recepcao', 'recepcao', 'O primeiro contato', 'Recepção',
   'Comece com uma conversa: um primeiro contato para entender possibilidades sem escolher sozinho.',
   'Ninguém precisa saber de antemão o que procura. A conversa inicial existe para escutar o momento e apresentar os caminhos possíveis, sem pressa e sem compromisso.',
   '', '', array['acolhimento', 'escuta', 'primeiro contato'], 'recepcao.html', 'right', 1, true),
  ('atendimentos', 'atendimentos', 'O cuidado', 'Atendimentos',
   'Cada pessoa chega com uma história diferente. O acolhimento vem antes da escolha de qualquer caminho.',
   'Encontre acolhimento, orientação e práticas que respeitam o momento e a história de cada pessoa.',
   '', '', array['acolhimento', 'terapias', 'orientação'], 'atendimentos.html', 'left', 2, true),
  ('cursos', 'cursos', 'O conhecimento', 'Cursos',
   'Cuidar também é aprender: conhecimento e prática se encontram para abrir novas possibilidades.',
   'Formações, oficinas e vivências aproximam estudo e experiência para abrir novas possibilidades.',
   '', '', array['formações', 'oficinas', 'estudo'], 'cursos.html', 'right', 3, true),
  ('atividades', 'atividades', 'O movimento', 'Atividades',
   'Conhecimento também precisa ser vivido no corpo, na criação e na convivência.',
   'Práticas corporais, arte e convivência transformam conhecimento em experiência compartilhada.',
   '', '', array['yoga', 'tai chi', 'arte e movimento'], 'atividades.html', 'left', 4, true),
  ('profissionais', 'profissionais', 'As pessoas', 'Profissionais',
   'Trajetórias diferentes, reunidas pelo compromisso de escutar e acompanhar.',
   'Conheça trajetórias e especialidades reunidas pelo compromisso de escutar e acompanhar.',
   '', '', array['trajetórias', 'especialidades', 'presença'], 'profissionais.html', 'right', 5, true),
  ('programacao', 'programacao', 'O Potala está vivo', 'Programação',
   'Atendimentos, cursos, vivências e atividades formam uma agenda em movimento.',
   'Descubra o que está acontecendo agora: encontros, práticas, cursos e experiências abertas à comunidade.',
   '', '', array['agenda', 'encontros', 'experiências'], 'programacao.html', 'left', 6, true),
  ('arte-cultura', 'arte-cultura', 'O encontro', 'Arte e cultura',
   'Cinema, música, livros, conversa e criação ampliam o modo como encontramos o mundo.',
   'Cinema, música, literatura e criação ampliam nossos modos de perceber, conviver e cuidar.',
   '', '', array['cinema', 'música', 'literatura'], 'cultura.html', 'right', 7, true),
  ('marketplace', 'marketplace', 'A loja', 'Marketplace',
   'Cristais, incensos, livros e óleos essenciais — o que a casa reúne para levar junto.',
   'Uma seleção contextual de livros, aromas, objetos e materiais que podem acompanhar sua prática.',
   '', '', array['cristais', 'incensos', 'livros'], 'marketplace.html', 'left', 8, true),
  ('inspiracao', 'inspiracao', 'Uma pausa', 'Inspiração',
   'Nem todo encontro precisa pedir uma decisão. Alguns apenas devolvem espaço.',
   'Textos, meditações e pausas para recuperar espaço, presença e um ritmo mais atento.',
   '', '', array['reflexões', 'meditação', 'silêncio'], 'inspiracao.html', 'right', 9, true)
on conflict (id) do nothing;

commit;
