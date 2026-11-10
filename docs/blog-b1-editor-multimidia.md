# Blog B1 — editor multimídia profissional

Estado: **preparado, não aplicado.** A migration `202611100001_blog_validacao_de_conteudo.sql` não foi aplicada em Production nem em nenhum banco oficial. Base desta branch: PR #43 (`63c71e8`).

## O que já existia (auditoria)

O Blog já tem editor por blocos na Mesa (`blog-editor.js`, `mesa-blocos.js`, `mesa-midia.js`): título, subtítulo, resumo, categoria; parágrafo, H2/H3, imagem com legenda e texto alternativo, galeria, citação, destaque, lista (ordenada ou não), separador e vídeo por URL (YouTube/Vimeo); negrito, itálico e link por marcas (`**`, `*`, `[texto](endereço)`); biblioteca de imagens (bucket `blog-midia`); pré-visualização no tamanho do computador e do celular; versões; salvamento automático; status rascunho, revisão, agendado, publicado e arquivado. O texto é um JSON em `blog_posts.document`, renderizado por `article-renderer.js`. A decisão foi **não trocar nem somar biblioteca** (Tiptap seria uma segunda fonte de verdade e peso novo no bundle, sem cobrir nada que falte à B1).

Permissões (RPC `mesa_salvar_post`, migration `202611060005`): `blog:edit` altera só textos próprios; `blog:publish` publica, agenda, arquiva e destaca. O Escritor envia para revisão (`acao = revisao`); o Editor publica; o Owner mantém tudo. Nada disso foi alterado.

## O que a B1 corrige

| Lacuna encontrada | Correção |
|---|---|
| Fallback de vídeo imprimia `block.url` cru em `<a href>` (`javascript:` passava) | Só link http(s) seguro, `rel="noopener noreferrer"`; senão nada |
| Iframe do player carregava sozinho (sem consentimento, peso e rastreamento) | Botão "Assistir ao vídeo": o player só é criado ao clicar (`article-video.js`); link "Abrir no YouTube/Vimeo" e aviso para vídeo privado ou sem incorporação |
| URL de vídeo lida por regex solta | `normalizarVideo` estrito: provedores YouTube/Vimeo, identificador inteiro, sem usuário/senha, domínio exato; Vimeo com hash de vídeo não listado |
| Imagem e capa sem validação de esquema | `imagemSegura`: https ou arquivo do próprio site; `data:`, `javascript:`, `http:` e `//` recusados |
| Gravação sem validação (só o navegador barrava) | Gatilho no banco (migration preparada) com as mesmas regras do JavaScript |
| Publicar com vídeo não reconhecido | O editor avisa antes de publicar ou agendar; o banco recusa na publicação |
| Itens e negrito de lista quase invisíveis no artigo (a classe `.article-list` das seções claras vazava um marrom escuro e uma barra de 9×1px no marcador) | Reset em `artigo.css`: texto herda a cor do artigo, negrito em marfim, marcador normal. Vale também para as 8 listas dos artigos atuais |
| Endereço comprido colado no texto era cortado em 320px | `overflow-wrap: anywhere` na coluna do artigo |

Peso: nenhuma biblioteca nova. Acrescenta `blog-conteudo.js` (~7 KB, sem dependências) e `article-video.js` (~1,5 KB), ambos módulos ES carregados só pelo artigo e pela Mesa; o build não mudou de forma perceptível.

Regras em um só lugar: `outputs/js/blog/blog-conteudo.js`. O teste `blog-b1-conteudo.test.mjs` roda JavaScript e SQL (PGlite) com os mesmos casos e exige a mesma decisão e a mesma mensagem.

## Compatibilidade com os 20 + 3 artigos

Nenhum campo novo e nenhum formato novo: a B1 não exige reescrever nenhum texto. Preflight de leitura em Production (somente `select`): 23 linhas (20 publicadas, 3 rascunhos), 0 pendentes, sem gatilhos em `blog_posts`; blocos existentes: parágrafo 48, título 20, citação 20, lista 8, imagem 1; **0 vídeos**; imagens e capas só `media/...` ou vazias. Todos os 23 documentos passam nas regras (inclusive a de publicação), conferidos contra a função SQL em PGlite com cópia somente-leitura dos documentos. Nenhuma linha é alterada pela migration.

## Preflight (antes de aplicar)

1. Confirmar que a PR #43 foi mesclada (ou que esta branch será aplicada junto) e que não há outra migration de `blog_posts` pendente.
2. Rodar, somente leitura, a validação nos documentos atuais. Resultado esperado: **0 linhas**.
   ```sql
   select id, status, public.blog_documento_problema(document, status in ('published','scheduled')) as problema
   from public.blog_posts
   where public.blog_documento_problema(document, status in ('published','scheduled')) is not null
      or public.blog_documento_problema(pending_document, false) is not null;
   ```
   (Só funciona depois de criar as funções; antes disso, usar a cópia dos documentos em PGlite como nos testes.)
3. Conferir `select tgname from pg_trigger where tgrelid = 'public.blog_posts'::regclass and not tgisinternal;` (esperado: vazio antes; `blog_posts_valida_conteudo` depois).

## Backup

Antes de aplicar: `select id, status, document, pending_document, updated_at from public.blog_posts` exportado em JSON (23 linhas hoje) e `select * from public.blog_post_versions`. A migration não escreve nesses dados; o backup é só precaução.

## Impacto

- Textos existentes: nenhum muda. O gatilho dispara só em INSERT/UPDATE de `document`, `pending_document` ou `status`; o contador de leituras não o aciona.
- Escritor e Editor: passam a receber mensagem de erro clara (código 22023) se tentarem gravar HTML perigoso, link `javascript:`, imagem fora de https/site ou vídeo executável; Editor/Owner não conseguem publicar ou agendar um texto com vídeo que não seja YouTube/Vimeo. Rascunho e revisão aceitam um endereço de vídeo ainda não reconhecido (o editor avisa).
- Agendamento: um texto agendado já foi validado como publicável; a virada para `published` não tem como falhar por conteúdo.
- Desempenho: validação linear no tamanho do documento, por linha gravada.
- Sem mudança de RLS, grants, RPCs, permissões ou Owner.

## Rollback

```sql
begin;
drop trigger if exists blog_posts_valida_conteudo on public.blog_posts;
drop function if exists public.blog_posts_valida_conteudo();
drop function if exists public.blog_documento_problema(jsonb, boolean);
drop function if exists public.blog_texto_problema(jsonb, text);
drop function if exists public.blog_video_reconhecido(text);
drop function if exists public.blog_imagem_segura(text);
drop function if exists public.blog_url_segura(text);
commit;
```
O rollback não toca em nenhum dado. O frontend segue funcionando sem a migration (a validação no navegador e na renderização continua valendo); a migration só acrescenta a barreira no banco.

## Consentimento e privacidade

O player (YouTube em modo `youtube-nocookie.com` ou Vimeo) só é criado depois do clique do leitor, que é a escolha explícita; antes disso nenhuma requisição vai ao provedor e nenhum cookie é gravado. Não há banner de consentimento no portal hoje (a base de Legal/Cookies é a PR #21, aberta): quando existir, o botão deve consultá-lo antes de criar o iframe (ponto único: `ativarVideos`).

## Fora da B1 (B2 e B3)

- **B2:** upload de imagens com a biblioteca de mídia mais completa (recorte, otimização, texto alternativo obrigatório), upload de vídeo, miniatura própria do vídeo sem requisição ao provedor, integração com o consentimento da PR #21.
- **B3:** edição inline rica (barra de formatação flutuante estilo Ghost, colar do Word/Docs com limpeza), comentários de revisão entre Escritor e Editor, histórico visual de versões com comparação.

## Homologação

Feita (dados sintéticos, sem tocar em Production): `test:portal`, `lint`, `verificar:ambiente`, `build`; testes de segurança (XSS, provedores, imagens, iframe só após clique); paridade JS/SQL e gatilho em PGlite, incluindo as gravações exatas do `mesa_salvar_post` (upsert, pendência, troca de status, destaque, edição de artigo existente); texto sintético em 320, 375, 390, 768, 1366 e 1920 px sem overflow; editor da Mesa em modo de teste local com prévia em Computador e Celular.

Pendente de homologação autenticada (Escritor, Editor e Owner, em ambiente autorizado, depois do merge da #43):
- Escritor: criar rascunho com texto, imagem e vídeo, salvar, reabrir, enviar para revisão; confirmar que não publica nem agenda.
- Editor: revisar e publicar; confirmar que o vídeo aparece no site público e que um provedor não permitido é barrado.
- Owner: confirmar que nada muda nas permissões.
- Envio de imagem pela biblioteca de mídia e gravação real pelo `mesa_salvar_post` com a migration aplicada (só depois de autorização).
- A Preview da Vercel fica atrás da guarda de ambiente e da proteção de deploy; não foi contornada.

## CI da PR empilhada

O workflow `CI` (`.github/workflows/ci.yml`) roda em `pull_request` com `branches: [main]`. A PR #44 tem como base a branch da #43, então o GitHub não dispara o job "Lint, testes e verificação de ambiente". Não é falha nem desativação de check: é o filtro de branch. Não há proteção de branch nem ruleset configurados (a API devolve 404 e lista vazia), e o workflow não tem `workflow_dispatch`; por isso não há execução manual sem alterar o workflow, e nada foi alterado.

Os mesmos comandos (`npm run lint`, `test:portal`, `verificar:ambiente`, `build`) rodam localmente e passam. Depois do merge da #43 a base da #44 passa a ser `main`; mudar a base não dispara o CI (o tipo `edited` não está nos gatilhos padrão), então é preciso um push (rebase) ou fechar e reabrir a PR para o workflow completo rodar. Só então a #44 fica pronta para merge.

## Revisão final da migration

- Privilégios: nenhum `grant`. As seis funções têm `revoke ... from public, anon, authenticated`; o teste com o papel `authenticated` confirma que elas não são chamáveis e que a gravação na tabela continua passando pelo gatilho. A função do gatilho é `security definer` com `search_path` vazio e não lê nem escreve em tabela; isso é necessário porque `authenticated` não pode executar as funções internas.
- Idempotência: `create or replace` e `drop trigger if exists`; aplicar duas vezes deixa um único gatilho (testado). Tudo em `begin/commit`.
- Rollback: `drop trigger` e `drop function` (seção Rollback). Não há dado a desfazer.
- Mensagens: erro `22023` com texto em português ("Bloco 2: o vídeo precisa ser um link do YouTube ou do Vimeo."); a Mesa mostra `error.message` quando o código não é `42501`.
- Desempenho (PGlite/WASM, mais lento que Postgres real): +3 ms por gravação de um texto típico (25 parágrafos); +120 ms no limite absoluto de 300 blocos x 2000 caracteres. O gatilho só dispara em `document`, `pending_document` ou `status`.

## Roteiro de homologação autenticada

Pré-requisitos: #43 mesclada e #44 rebaseada; ambiente autorizado (LAB ou Preview autorizada, nunca Production sem autorização escrita); contas existentes de Escritor, Editor e Owner (nenhuma conta nova, nenhuma permissão alterada); migration aplicada primeiro no LAB, se houver; dados sintéticos com prefixo `[TESTE B1]`.

1. Escritor: criar `[TESTE B1] artigo`, com parágrafo, H2, lista, citação, imagem (com alt e legenda) e vídeo YouTube; salvar; recarregar e conferir que nada se perdeu; enviar para revisão. Esperado: botão Publicar ausente; tentar um vídeo de outro provedor é aceito como rascunho com aviso.
2. Editor: abrir o texto em revisão; tentar publicar com vídeo de provedor não permitido (esperado: aviso no editor e recusa); trocar por um vídeo válido e publicar; abrir o Blog público, conferir o botão "Assistir ao vídeo" sem requisição ao provedor antes do clique, o player após o clique, o link "Abrir no YouTube"; despublicar e conferir que sai do Blog.
3. Owner: conferir que a lista de acessos e as permissões estão iguais ao início; conferir que os 20 artigos e 3 rascunhos não mudaram (contagem e `updated_at`).
4. Biblioteca de mídia: Escritor envia uma imagem sintética pequena e a usa no texto; confirmar que só apaga o que enviou; Editor/Owner enxergam e podem usar.
5. Limpeza: arquivar ou despublicar os `[TESTE B1]` e registrar o que foi feito.

## Sequência segura até a publicação

1. Mesclar a #43 (autorização do responsável), depois atualizar a base da #44, rebase, CI completo verde, diff exclusivo.
2. Aplicar a migration no LAB (ou banco de teste), rodar o roteiro acima.
3. Em Production, com autorização específica: preflight somente leitura, backup, migration, repetir o preflight e verificar o gatilho.
4. Mesclar a #44 e fazer o deploy; conferir os 20 artigos publicados.
