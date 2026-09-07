# Portal Potala — Blog e editor visual local

**Data:** 2026-09-07  
**Status:** aprovado em conversa; aguardando revisão deste documento  
**Escopo:** representação funcional somente no front-end, sem novas tabelas ou gravações no Supabase

## Objetivo

Transformar o Blog existente em um “Caderno de Travessia” editorial e criar uma representação funcional de seu painel de edição. O administrador poderá adicionar, editar, excluir e visualizar posts, mas não alterar livremente a estrutura visual do Blog. O layout continuará sendo responsabilidade do Portal, garantindo consistência entre publicações.

## Base preservada

- `outputs/blog.html`, seus filtros editoriais e o conceito de conteúdo do Potala serão evoluídos, não substituídos por uma aplicação genérica.
- A sessão, as credenciais e a verificação de papel administrativo já implementadas com Supabase Auth serão reutilizadas.
- O painel da Home continuará funcionando sem mudanças em seu modelo de dados.
- A identidade visual permanecerá ligada à Travessia: paisagem atmosférica, marrons, dourado, marfim, serifas editoriais e movimentos discretos.

## Experiência pública do Blog

### Página inicial

A página terá composição fixa inspirada na referência aprovada:

1. Cabeçalho panorâmico com a marca Potala, os temas editoriais, o título “Caderno de Travessia” e uma frase curta.
2. Artigo principal em destaque, com imagem ampla, categoria, título, resumo e ação “Ler artigo”.
3. Grade de artigos publicados, ordenada por data decrescente.
4. Coluna lateral com busca, categorias, convite editorial e posts recentes.
5. Adaptação mobile em uma coluna, sem rolagem horizontal e sem ocultar busca ou categorias.

A posição não será configurável livremente. Um único post poderá ser o destaque. Ao marcar outro, o destaque anterior volta para a grade. Os demais posts aparecerão na grade e na lista de recentes segundo data e status.

### Página do artigo

Cada post abrirá `artigo.html?post=<slug>`. A página usará um template único e receberá os dados do post selecionado. Ela conterá:

- categoria, título, subtítulo, autor, data e tempo de leitura;
- imagem de capa com texto alternativo;
- corpo formado por blocos editoriais;
- navegação de retorno ao Blog;
- conteúdos relacionados;
- representação de comentários no final.

Se o slug não existir ou o post estiver oculto, a página mostrará um estado editorial de “texto não encontrado” e oferecerá retorno ao Blog.

## Modelo de conteúdo local

Cada post terá:

- `id`, `slug`, `title`, `subtitle` e `excerpt`;
- `category`, `author`, `publishedAt` e `readingMinutes`;
- `cover`, `coverAlt` e `featured`;
- `status`: `draft`, `published` ou `hidden`;
- `content`: lista ordenada de blocos;
- `relatedPostIds`;
- `updatedAt`.

Os tipos de bloco serão deliberadamente limitados:

- parágrafo;
- subtítulo;
- imagem com texto alternativo e legenda opcional;
- citação;
- lista;
- divisor.

Essa lista é suficiente para representar um artigo completo sem transformar o painel em um construtor irrestrito de páginas.

## Editor visual

Será criada uma área dedicada ao Blog, ligada ao painel atual. Ela usará a mesma sessão administrativa e a mesma checagem em `admin_users`, mas não escreverá nas tabelas do Supabase nesta fase.

O layout seguirá a referência:

- topo com retorno, alternância de dispositivo, visualizar, salvar rascunho e publicar localmente;
- coluna esquerda com lista de posts, busca, estados e ação “Novo post”;
- centro com prévia real do Blog ou do artigo em iframe;
- coluna direita com propriedades do post e edição dos blocos do artigo.

O editor permitirá:

- criar e excluir posts;
- editar todos os campos do post;
- marcar o destaque;
- alternar entre rascunho, publicado e oculto;
- adicionar, editar, excluir e reordenar blocos do artigo;
- alternar a prévia entre desktop, tablet e mobile;
- ver a prévia atualizar enquanto os campos mudam.

Os dados serão persistidos em `localStorage` com uma chave exclusiva do protótipo. Uma ação explícita restaurará o acervo demonstrativo. “Publicar” significará tornar o post visível na cópia local do Blog; não significará publicação remota.

## Autenticação

O acesso usará `getSupabaseClient()` e `createAdminAuth()`, exatamente como o painel da Home. Um administrador já autenticado entrará diretamente no editor do Blog. Uma conta sem registro válido em `admin_users` continuará bloqueada.

Nenhum cadastro público ou segundo conjunto de credenciais será criado.

## Prévia ao vivo

O editor enviará o acervo local para o iframe com `postMessage`. O Blog e a página de artigo aceitarão essas mensagens somente no modo de prévia e somente da mesma origem. Fora do painel, carregarão o acervo local publicado ou os dados demonstrativos padrão.

O iframe não compartilhará a lógica do formulário: receberá apenas uma lista normalizada de posts. Isso mantém o renderizador público independente do editor.

## Comentários demonstrativos

Os artigos terão alguns comentários de exemplo e um formulário acessível. Novos comentários serão adicionados somente no navegador, associados ao slug do artigo e identificados claramente como demonstração. Não haverá login de leitores, moderação, envio de e-mail ou gravação remota nesta fase.

## Estados e segurança visual

- Campos obrigatórios terão mensagens claras antes de o rascunho ser aceito.
- Excluir exigirá confirmação e atualizará a prévia imediatamente.
- Um post sem capa usará um tratamento visual padrão, sem imagem quebrada.
- Conteúdo inserido pelo editor será escapado ou convertido por funções restritas; HTML arbitrário não será aceito.
- Foco visível, navegação por teclado, textos alternativos e `prefers-reduced-motion` serão preservados.

## Arquivos previstos

### Evoluir

- `outputs/blog.html`
- `outputs/css/blog.css`
- `outputs/js/blog/blog-data.js`
- `outputs/js/blog/blog-controller.js`
- `outputs/admin.html` ou sua navegação para o editor do Blog

### Criar

- `outputs/artigo.html`
- `outputs/blog-admin.html`
- estilos do editor do Blog e do artigo
- modelo, repositório local, renderizador de artigo e controlador do editor
- testes de modelo, Blog, artigo, autenticação reutilizada, prévia e operações locais

## Não objetivos desta fase

- criar tabelas ou migrações no Supabase;
- enviar imagens para storage remoto;
- publicar comentários reais;
- permitir HTML arbitrário;
- permitir que o administrador mova livremente regiões estruturais do Blog;
- alterar o painel ou o banco da Home;
- implementar newsletter, métricas reais ou busca no servidor.

## Critérios de aceitação

- O Blog corresponde à hierarquia visual da referência sem copiar seus textos ou marca.
- Um post pode ser criado, editado, excluído e destacado no protótipo.
- O layout decide automaticamente destaque, grade e recentes.
- Cada post publicado abre uma página completa pelo seu slug.
- Todos os seis tipos de bloco renderizam no artigo.
- A prévia acompanha as alterações sem recarregar a página do painel.
- Desktop, tablet e mobile podem ser conferidos no editor.
- O mesmo login do painel da Home protege o editor do Blog.
- Recarregar preserva os dados locais; restaurar recupera o acervo demonstrativo.
- A Home, seu painel e o Supabase permanecem sem regressões.
