-- B1 DO BLOG: VALIDAÇÃO DO CONTEÚDO NO PONTO CONFIÁVEL DE GRAVAÇÃO.
--
-- PREPARADA, NÃO APLICADA. Não roda em Production sem aprovação (ver
-- docs/blog-b1-editor-multimidia.md: preflight, backup, impacto e rollback).
--
-- Até aqui o RPC mesa_salvar_post grava o JSON do texto como chegou: a única
-- barreira estava no navegador. Esta migration põe a regra no banco, num
-- gatilho em public.blog_posts, para valer também para qualquer outro caminho
-- de gravação. Não mexe em RPCs, grants, RLS nem permissões, e não altera
-- nenhuma linha existente: o gatilho só dispara em INSERT ou UPDATE de
-- document, pending_document ou status.
--
-- As regras espelham outputs/js/blog/blog-conteudo.js (os testes rodam as duas
-- implementações com os mesmos casos):
--   * o texto é um objeto; content é uma lista de até 300 blocos conhecidos;
--   * texto de bloco: até 20000 caracteres, sem tag de HTML perigosa e sem link
--     que não seja http(s) ou caminho do próprio site;
--   * imagem e capa: https ou arquivo do próprio site (nunca data:, javascript:
--     nem http solto);
--   * vídeo: nunca endereço executável; e, para o que o público lê (published
--     ou scheduled), só YouTube ou Vimeo, com identificador completo;
--   * pending_document (alterações de um texto no ar) segue as regras de
--     rascunho; a regra de publicação vale quando ele é promovido a document.
begin;

create or replace function public.blog_url_segura(p_url text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_url is null or p_url = '' or (
    p_url !~ '[[:space:]<>"\\]'
    and (p_url ~* '^https?://[^[:space:]]+$' or (p_url !~ '^[^/?#]*:' and p_url !~ '^//'))
  );
$$;

create or replace function public.blog_imagem_segura(p_src text)
returns boolean language sql immutable set search_path = ''
as $$
  select p_src is null or p_src = '' or (
    (p_src ~* '^https://[^[:space:]]+$' and p_src !~ '[<>"\\]')
    or (public.blog_url_segura(p_src) and p_src !~* '^https?:' and p_src not like '#%')
  );
$$;

create or replace function public.blog_video_reconhecido(p_url text)
returns boolean language sql immutable set search_path = ''
as $$
  select length(btrim(coalesce(p_url, ''))) between 1 and 300 and (
    btrim(p_url) ~ '^(https?://)?(www\.|m\.)?(youtube\.com/(watch\?([^#[:space:]]*&)?v=|embed/|shorts/|live/)|youtu\.be/|youtube-nocookie\.com/embed/)[A-Za-z0-9_-]{11}([&?#/][^[:space:]]*)?$'
    or btrim(p_url) ~ '^(https?://)?(((www\.)?vimeo\.com/[0-9]{5,12}(/[A-Za-z0-9]{6,20})?)|(player\.vimeo\.com/video/[0-9]{5,12}))([?#][^[:space:]]*)?$'
  );
$$;

-- Problema de um campo de texto, ou null.
create or replace function public.blog_texto_problema(p_valor jsonb, p_onde text)
returns text language plpgsql immutable set search_path = ''
as $$
declare v text; alvo text[];
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then return null; end if;
  if jsonb_typeof(p_valor) <> 'string' then return p_onde || ': o conteúdo precisa ser texto.'; end if;
  v := p_valor #>> '{}';
  if length(v) > 20000 then return p_onde || ': texto longo demais.'; end if;
  if v ~* '<[[:space:]]*/?[[:space:]]*(script|iframe|object|embed|style|link|meta|svg|math|form|base)([^[:alnum:]_]|$)' then
    return p_onde || ': o editor não aceita HTML. Escreva só o texto.';
  end if;
  for alvo in select m from regexp_matches(v, '\]\(((?:[^()[:space:]]|\([^()[:space:]]*\))*)\)', 'g') as m loop
    if not public.blog_url_segura(alvo[1]) then
      return p_onde || ': há um link que não é um endereço http(s) ou do próprio site.';
    end if;
  end loop;
  return null;
end;
$$;

-- Primeiro problema encontrado no texto, ou null. p_publicacao: vale também o que o leitor vai ver.
create or replace function public.blog_documento_problema(p_doc jsonb, p_publicacao boolean default false)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  bloco jsonb; foto jsonb; item jsonb; indice int := 0; onde text; tipo text; campo text; achado text; url text;
begin
  if p_doc is null or jsonb_typeof(p_doc) = 'null' then return null; end if;
  if jsonb_typeof(p_doc) <> 'object' then return 'Texto inválido.'; end if;
  if p_doc ? 'cover' and jsonb_typeof(p_doc -> 'cover') not in ('string', 'null') then
    return 'A capa precisa ser uma imagem https ou um arquivo do próprio site.';
  end if;
  if not public.blog_imagem_segura(p_doc ->> 'cover') then
    return 'A capa precisa ser uma imagem https ou um arquivo do próprio site.';
  end if;
  if not (p_doc ? 'content') or jsonb_typeof(p_doc -> 'content') = 'null' then return null; end if;
  if jsonb_typeof(p_doc -> 'content') <> 'array' then return 'O conteúdo do texto está em formato inválido.'; end if;
  if jsonb_array_length(p_doc -> 'content') > 300 then return 'O texto tem blocos demais.'; end if;

  for bloco in select value from jsonb_array_elements(p_doc -> 'content') loop
    indice := indice + 1;
    onde := 'Bloco ' || indice;
    if jsonb_typeof(bloco) <> 'object' then return onde || ': formato inválido.'; end if;
    tipo := bloco ->> 'type';
    if tipo is null or tipo not in ('paragraph','heading','image','gallery','quote','callout','video','list','divider') then
      return onde || ': tipo de bloco desconhecido.';
    end if;
    foreach campo in array array['text','caption','cite','alt'] loop
      achado := public.blog_texto_problema(bloco -> campo, onde);
      if achado is not null then return achado; end if;
    end loop;
    if tipo = 'image' then
      if jsonb_typeof(bloco -> 'src') not in ('string', 'null') or not public.blog_imagem_segura(bloco ->> 'src') then
        return onde || ': a imagem precisa ser https ou um arquivo do próprio site.';
      end if;
    elsif tipo = 'gallery' then
      if bloco ? 'images' and jsonb_typeof(bloco -> 'images') <> 'null' then
        if jsonb_typeof(bloco -> 'images') <> 'array' or jsonb_array_length(bloco -> 'images') > 12 then
          return onde || ': a galeria aceita até 12 fotos.';
        end if;
        for foto in select value from jsonb_array_elements(bloco -> 'images') loop
          if jsonb_typeof(foto) <> 'object' or jsonb_typeof(foto -> 'src') not in ('string', 'null')
             or not public.blog_imagem_segura(foto ->> 'src') then
            return onde || ': uma foto da galeria não é https nem arquivo do próprio site.';
          end if;
          achado := public.blog_texto_problema(foto -> 'alt', onde);
          if achado is not null then return achado; end if;
        end loop;
      end if;
    elsif tipo = 'list' then
      if bloco ? 'items' and jsonb_typeof(bloco -> 'items') <> 'null' then
        if jsonb_typeof(bloco -> 'items') <> 'array' or jsonb_array_length(bloco -> 'items') > 40 then
          return onde || ': a lista aceita até 40 itens.';
        end if;
        for item in select value from jsonb_array_elements(bloco -> 'items') loop
          achado := public.blog_texto_problema(item, onde);
          if achado is not null then return achado; end if;
        end loop;
      end if;
    elsif tipo = 'video' then
      if bloco ? 'url' and jsonb_typeof(bloco -> 'url') not in ('string', 'null') then
        return onde || ': o endereço do vídeo não é seguro.';
      end if;
      url := coalesce(bloco ->> 'url', '');
      if not public.blog_url_segura(url) then return onde || ': o endereço do vídeo não é seguro.'; end if;
      if p_publicacao and btrim(url) <> '' and not public.blog_video_reconhecido(url) then
        return onde || ': o vídeo precisa ser um link do YouTube ou do Vimeo.';
      end if;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.blog_posts_valida_conteudo()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare problema text;
begin
  problema := public.blog_documento_problema(new.document, new.status in ('published', 'scheduled'));
  if problema is null then
    problema := public.blog_documento_problema(new.pending_document, false);
  end if;
  if problema is not null then
    raise exception '%', problema using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists blog_posts_valida_conteudo on public.blog_posts;
create trigger blog_posts_valida_conteudo
  before insert or update of document, pending_document, status on public.blog_posts
  for each row execute function public.blog_posts_valida_conteudo();

-- Só o gatilho usa estas funções; ninguém as chama pela API.
revoke all on function public.blog_url_segura(text) from public, anon, authenticated;
revoke all on function public.blog_imagem_segura(text) from public, anon, authenticated;
revoke all on function public.blog_video_reconhecido(text) from public, anon, authenticated;
revoke all on function public.blog_texto_problema(jsonb, text) from public, anon, authenticated;
revoke all on function public.blog_documento_problema(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.blog_posts_valida_conteudo() from public, anon, authenticated;

commit;
