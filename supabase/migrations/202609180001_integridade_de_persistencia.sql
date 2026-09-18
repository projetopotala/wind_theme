-- UMA FONTE DE SENHA E REFERÊNCIAS ÍNTEGRAS NO BLOG.
--
-- A senha administrativa chegou a existir também em public.users. O painel já
-- autentica exclusivamente pelo Supabase Auth; manter hash e funções paralelas
-- cria uma segunda credencial sem uso. Esta migração remove essa sobra.
--
-- Comentários e leituras pertencem estritamente a um post. As constraints
-- nascem NOT VALID para não apagar nem bloquear a implantação caso exista um
-- órfão legado; operações novas já são verificadas. Depois de consultar e
-- tratar eventuais órfãos, elas podem ser validadas sem recriar a relação.

begin;

drop function if exists public.verify_portal_password(text, text);
drop function if exists public.set_portal_user_password(text, text);

alter table public.users
  drop column if exists password_hash;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'blog_post_views_post_slug_fk'
      and conrelid = 'public.blog_post_views'::regclass
  ) then
    alter table public.blog_post_views
      add constraint blog_post_views_post_slug_fk
      foreign key (slug) references public.blog_posts (slug)
      on update cascade
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'blog_comments_post_slug_fk'
      and conrelid = 'public.blog_comments'::regclass
  ) then
    alter table public.blog_comments
      add constraint blog_comments_post_slug_fk
      foreign key (post_slug) references public.blog_posts (slug)
      on update cascade
      on delete cascade
      not valid;
  end if;
end;
$migration$;

commit;

-- Diagnóstico antes de validar em uma instalação antiga:
-- select v.slug from public.blog_post_views v
-- left join public.blog_posts p on p.slug = v.slug where p.id is null;
-- select c.id, c.post_slug from public.blog_comments c
-- left join public.blog_posts p on p.slug = c.post_slug
-- where c.post_slug is not null and p.id is null;
--
-- Depois de resolver qualquer linha retornada:
-- alter table public.blog_post_views validate constraint blog_post_views_post_slug_fk;
-- alter table public.blog_comments validate constraint blog_comments_post_slug_fk;
