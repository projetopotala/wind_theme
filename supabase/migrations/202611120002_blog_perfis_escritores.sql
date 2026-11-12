-- P2B: perfis editoriais dos escritores do Caderno de Travessia.
--
-- Uma linha por endereço público de escritor (o mesmo slug que a P2A deriva da assinatura,
-- ex.: "nucleo-de-oraculos"). Guarda só o que é público: nome, apresentação, imagem e se o
-- perfil aparece. Não há vínculo com conta: o perfil não concede nada a ninguém, e assinar
-- um texto com um nome não dá acesso ao perfil desse nome.
--
-- Quem altera: somente quem publica no Blog (Editor ou Owner/Admin), pela mesma regra que já
-- protege categorias e mídia (has_portal_permission('blog','publish')). Escritor só lê.
-- Visitante lê só perfis visíveis, e só as colunas públicas (updated_by fica fora).
--
-- O que NÃO muda: blog_posts, mesa_salvar_post/mesa_listar_posts, versões, categorias,
-- permissões, contas. Nenhum texto existente é alterado. Nenhum perfil é criado aqui.
--
-- Rollback: supabase/rollbacks/202611120002_rollback_blog_perfis_escritores.sql (sem perda
-- em outras tabelas; apaga só os perfis cadastrados).

begin;

create table if not exists public.blog_writer_profiles (
  slug text primary key
    check (char_length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  bio text not null default '' check (char_length(bio) <= 1500),
  -- Só imagens do próprio site (media/...) ou da biblioteca do Blog (bucket blog-midia).
  image text not null default '' check (
    char_length(image) <= 500 and (
      image = ''
      or (image ~ '^media/[A-Za-z0-9][A-Za-z0-9._/-]*$' and image !~ '\.\.')
      or image ~ '^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/public/blog-midia/[A-Za-z0-9._%-]+$'
    )
  ),
  image_alt text not null default '' check (char_length(image_alt) <= 200),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Data e autor da alteração vêm do banco, nunca do navegador.
create or replace function public.blog_writer_profiles_carimbo()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.bio := btrim(new.bio);
  new.image_alt := btrim(new.image_alt);
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end;
$$;
revoke all on function public.blog_writer_profiles_carimbo() from public, anon, authenticated;

drop trigger if exists blog_writer_profiles_carimbo on public.blog_writer_profiles;
create trigger blog_writer_profiles_carimbo
  before insert or update on public.blog_writer_profiles
  for each row execute function public.blog_writer_profiles_carimbo();

alter table public.blog_writer_profiles enable row level security;

revoke all on table public.blog_writer_profiles from public, anon, authenticated;
grant select (slug, name, bio, image, image_alt, visible, updated_at)
  on table public.blog_writer_profiles to anon, authenticated;
-- O slug é a identidade do perfil: entra na criação e nunca é trocado.
grant insert (slug, name, bio, image, image_alt, visible) on table public.blog_writer_profiles to authenticated;
grant update (name, bio, image, image_alt, visible) on table public.blog_writer_profiles to authenticated;
grant delete on table public.blog_writer_profiles to authenticated;

-- Duas políticas de leitura: has_portal_permission não é executável por anon (grant só para
-- authenticated), então o visitante tem uma política que não a chama.
drop policy if exists "todos leem perfis visiveis" on public.blog_writer_profiles;
create policy "todos leem perfis visiveis" on public.blog_writer_profiles
  for select to anon
  using (visible);

drop policy if exists "contas leem perfis visiveis e quem publica le todos" on public.blog_writer_profiles;
create policy "contas leem perfis visiveis e quem publica le todos" on public.blog_writer_profiles
  for select to authenticated
  using (visible or (select public.has_portal_permission('blog', 'publish')));

drop policy if exists "quem publica cria perfis" on public.blog_writer_profiles;
create policy "quem publica cria perfis" on public.blog_writer_profiles
  for insert to authenticated
  with check ((select public.has_portal_permission('blog', 'publish')));

drop policy if exists "quem publica altera perfis" on public.blog_writer_profiles;
create policy "quem publica altera perfis" on public.blog_writer_profiles
  for update to authenticated
  using ((select public.has_portal_permission('blog', 'publish')))
  with check ((select public.has_portal_permission('blog', 'publish')));

drop policy if exists "quem publica apaga perfis" on public.blog_writer_profiles;
create policy "quem publica apaga perfis" on public.blog_writer_profiles
  for delete to authenticated
  using ((select public.has_portal_permission('blog', 'publish')));

commit;
