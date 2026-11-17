-- Rollback da migration 202611170002_editar_site.sql ("Editar site").
-- ATENÇÃO: apaga o conteúdo publicado, rascunhos, histórico e auditoria do editor.
-- As páginas voltam ao HTML original (o conteúdo original nunca foi alterado nos arquivos).
-- Imagens já enviadas ao bucket 'site-editor-media' NÃO são removidas aqui (o Storage não permite
-- apagar objetos por SQL com segurança); remova-as pelo painel do Supabase se for o caso.

begin;

-- A policy do Storage depende de site_is_owner(): sai primeiro.
drop policy if exists "owner envia imagens do site" on storage.objects;

drop function if exists public.site_restore(text, integer, integer, boolean);
drop function if exists public.site_publish(text, integer, integer);
drop function if exists public.site_discard_draft(text, integer);
drop function if exists public.site_save_draft(text, jsonb, integer);
drop function if exists public.site_revision_content(text, integer);
drop function if exists public.site_editor_load(text);
drop function if exists public.site_check_page(text);
drop function if exists public.site_require_owner();
drop function if exists public.site_validate_content(jsonb);
drop function if exists public.site_is_owner();

drop table if exists public.site_edit_events;
drop table if exists public.site_page_revisions;
drop table if exists public.site_page_drafts;
drop table if exists public.site_pages_published;

commit;
