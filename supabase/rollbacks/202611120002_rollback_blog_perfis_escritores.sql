-- Rollback da P2B (202611120002). Remove só o que a migration criou.
-- Efeito: os perfis cadastrados são apagados; as páginas de escritor voltam à apresentação
-- neutra da P2A (o site trata a ausência da tabela sem erro). Nenhuma outra tabela muda.
begin;
drop policy if exists "quem publica apaga perfis" on public.blog_writer_profiles;
drop policy if exists "quem publica altera perfis" on public.blog_writer_profiles;
drop policy if exists "quem publica cria perfis" on public.blog_writer_profiles;
drop policy if exists "todos leem perfis visiveis" on public.blog_writer_profiles;
drop policy if exists "contas leem perfis visiveis e quem publica le todos" on public.blog_writer_profiles;
drop trigger if exists blog_writer_profiles_carimbo on public.blog_writer_profiles;
drop table if exists public.blog_writer_profiles;
drop function if exists public.blog_writer_profiles_carimbo();
commit;
