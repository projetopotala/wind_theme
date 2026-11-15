-- Reverte 202611160001: remove a leitura publica de cursos.
-- Efeito: a pagina Cursos volta a mostrar o estado "turmas em breve". Nenhum dado e alterado ou apagado.
-- NAO mexe no historico de migrations. Para retirar a versao do historico (somente com autorizacao
-- especifica): supabase migration repair --status reverted 202611160001 --linked
begin;
drop function if exists public.list_public_courses();
commit;
