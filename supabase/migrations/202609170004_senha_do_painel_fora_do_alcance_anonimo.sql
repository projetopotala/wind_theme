-- AS FUNÇÕES DE SENHA DO PAINEL SAEM DO ALCANCE DE QUEM VISITA O SITE.
--
-- No Supabase, toda função nova em public recebe EXECUTE para anon e
-- authenticated por privilégio padrão. As migrações anteriores revogavam só de
-- PUBLIC — e o grant explícito continuava lá. Conferido no banco em 17/09/2026:
--
-- * public.set_portal_user_password(e-mail, senha) podia ser chamada por
--   qualquer pessoa com a chave publicável. Ela troca a senha de qualquer conta
--   do Auth e a grava como owner em public.users: tomada completa do painel.
-- * public.verify_portal_password(e-mail, senha) respondia true/false: um
--   oráculo para testar senhas sem passar pelo limite de tentativas do Auth.
--
-- Nenhuma tela usa as duas — o login é o Auth (signInWithPassword) seguido da
-- consulta a public.users. Ficam para quem administra o banco pelo SQL Editor.
--
-- De carona, o que as migrações de conteúdo deixaram aberto pelo mesmo motivo:
-- as funções de publicação ao anônimo (elas recusam, mas não precisam ser
-- alcançáveis) e a tabela de rascunhos inteira ao anônimo, TRUNCATE incluído —
-- TRUNCATE não passa por RLS.

begin;

do $$
begin
  if to_regprocedure('public.set_portal_user_password(text, text)') is not null then
    revoke all on function public.set_portal_user_password(text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.verify_portal_password(text, text)') is not null then
    revoke all on function public.verify_portal_password(text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.replace_home_blocks(jsonb)') is not null then
    revoke all on function public.replace_home_blocks(jsonb) from public, anon;
  end if;
  if to_regprocedure('public.replace_home_blocks_editorial(jsonb)') is not null then
    revoke all on function public.replace_home_blocks_editorial(jsonb) from public, anon;
  end if;
  if to_regprocedure('public.publish_home_block_drafts()') is not null then
    revoke all on function public.publish_home_block_drafts() from public, anon;
  end if;
  if to_regclass('public.home_block_drafts') is not null then
    revoke all on table public.home_block_drafts from anon;
    revoke truncate, references, trigger on table public.home_block_drafts from authenticated;
  end if;
end;
$$;

commit;
