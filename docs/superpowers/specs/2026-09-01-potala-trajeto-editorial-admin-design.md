# Portal Potala — trajeto editorial e administração

**Data:** 2026-09-01
**Status:** aprovado para planejamento
**Escopo:** Chegada, Home e painel editorial em duas etapas

## 1. Objetivo

Evoluir a Chegada e a Home existentes sem reconstruir o Portal Potala do zero. A imagem `outputs/media/chegada.png` passa a definir a atmosfera da Chegada e o trajeto luminoso nela presente se torna o eixo narrativo da Home. A estrada medieval atual deixa de ser exibida.

A experiência deve permanecer contemplativa e responsiva, com uma progressão visual contínua entre Chegada e Home. O conteúdo editorial será disposto ao redor do trajeto e poderá, numa segunda etapa, ser administrado por usuários autorizados através do Supabase.

## 2. Decisões aprovadas

- Manter o portal no Vercel.
- Usar Three.js na experiência visual da Home.
- Adotar uma solução híbrida 2.5D: paisagem e trajeto em Three.js; textos e controles em HTML.
- Usar `media/chegada.png` como imagem principal da Chegada.
- Criar uma nova imagem para a Home, visualmente contínua com `chegada.png`.
- Preservar som, respiração 3-3-3 e passagem por scroll da Chegada.
- Substituir a estrada medieval por um trajeto luminoso central.
- Alternar os blocos entre os lados esquerdo e direito do trajeto.
- Permitir somente um bloco expandido por vez.
- Remover a passagem automática da Home para o Palácio.
- Implementar primeiro uma prévia integralmente local.
- Integrar Supabase, autenticação e armazenamento somente após aprovação visual da prévia.
- Não enviar a primeira etapa ao GitHub nem publicá-la automaticamente.

## 3. Estado atual a preservar

O portal público é servido a partir de arquivos estáticos em `outputs/`. A Home monta nove regiões a partir de `outputs/js/home/journey-data.js`, posiciona as regiões com `journey-layout.js`, controla scroll e presença com `home-controller.js` e desenha a estrada atual em Canvas 2D por `home-road.js`.

A Chegada possui cena própria, som opcional, respiração 3-3-3, estado de travessia e transições já testadas. Esses recursos não serão reimplementados; a nova composição será integrada aos seus pontos atuais.

Existe também uma base Vinext/Sites no repositório, mas ela não é o portal publicado no Vercel e não será usada para migrar a experiência nesta entrega.

O repositório contém trabalho local anterior que deverá ser preservado: a branch está à frente do remoto e `outputs/media/chegada.png` ainda não está versionado.

## 4. Entrega 1 — prévia local

### 4.1 Chegada

- `chegada.png` ocupará toda a área visível com composição responsiva (`cover` e ponto focal controlado por breakpoint).
- A interface existente de som e respiração permanecerá independente da imagem.
- A entrada na Home continuará sendo acionada pelo scroll, sem botão obrigatório.
- A câmera fará uma aproximação leve pelo caminho da imagem.
- Uma névoa/luz quente cobrirá a emenda entre as páginas.
- O trajeto Three.js da Home começará alinhado visualmente ao trajeto luminoso presente na imagem.

### 4.2 Paisagem da Home

Será gerada uma nova imagem sem texto, logotipo ou controles, com:

- amanhecer dourado, marrons e verdes profundos;
- montanhas, névoa e arquitetura discretas;
- continuidade de iluminação e perspectiva com `chegada.png`;
- área central livre para o caminho;
- caminho físico sutil, mas sem linha luminosa incorporada.

Serão preparadas composições responsivas para desktop e mobile quando um único recorte não preservar o ponto focal.

### 4.3 Trajeto Three.js

- A linha será construída a partir de uma curva contínua, com revelação ligada ao progresso real da página.
- O visual terá um núcleo dourado definido e um halo largo e suave, usando materiais aditivos simples.
- Não será necessário um pipeline pesado de pós-processamento para produzir o brilho.
- A câmera terá profundidade e deslocamento discretos, sem parallax agressivo.
- O trajeto permanecerá central e livre de textos ou blocos.
- No encerramento, o trajeto seguirá em direção ao horizonte e desaparecerá suavemente.
- Não haverá redirecionamento automático para `palacio.html`.
- Se WebGL não estiver disponível, será exibido um caminho estático coerente com a composição.

### 4.4 Blocos editoriais

Os blocos continuarão como elementos HTML para preservar legibilidade, foco, semântica, responsividade e facilidade de edição.

Cada bloco terá estado fechado e expandido:

- fechado: categoria, título e resumo curto;
- expandido: conteúdo complementar, imagem opcional, temas e link para a página específica.

Comportamento:

- os blocos alternam entre esquerda e direita;
- blocos à esquerda expandem para a esquerda;
- blocos à direita expandem para a direita;
- a expansão nunca cobre o trajeto;
- abrir um bloco fecha o anterior;
- `Escape` fecha o bloco atual;
- teclado, mouse e toque recebem o mesmo comportamento;
- o bloco não redireciona ao primeiro toque: o destino fica em um link explícito dentro da área expandida;
- no mobile, os blocos ficam em uma coluna e expandem verticalmente.

### 4.5 Scroll e movimento

- A página usará scroll nativo, sem scroll hijacking e sem inércia artificial.
- `requestAnimationFrame` será usado apenas para sincronizar o visual Three.js ao scroll.
- Entradas dos blocos usarão observação de visibilidade e transições de CSS, evitando leituras e escritas de layout a cada quadro.
- A linha será revelada progressivamente sem saltos.
- A paisagem terá apenas profundidade ambiental sutil.
- `prefers-reduced-motion` trocará movimentos complexos por fades e uma composição estática.

### 4.6 Painel editorial local

Será criada uma prévia local do painel com as seguintes ações:

- criar bloco;
- editar bloco;
- excluir bloco;
- ordenar por arraste e por controles de teclado;
- escolher lado esquerdo ou direito;
- publicar ou ocultar;
- restaurar o conteúdo padrão.

Campos previstos:

- `id`;
- `slug`;
- `category`;
- `title`;
- `summary`;
- `body`;
- `image`;
- `icon`;
- `tags`;
- `href`;
- `side` (`left` ou `right`);
- `position`;
- `published`;
- `updatedAt`.

Na prévia local, os dados serão salvos no navegador e o campo de imagem aceitará caminho ou URL. O armazenamento local será encapsulado por um repositório de conteúdo substituível, e não acessado diretamente pelos componentes.

A Home lerá somente itens publicados, ordenará por `position` e usará o conteúdo padrão quando o armazenamento local estiver vazio, incompatível ou corrompido.

A tela de login desta etapa será apenas demonstrativa e deverá deixar claro que ainda não representa proteção real.

## 5. Entrega 2 — Supabase após aprovação

### 5.1 Persistência

O repositório local será substituído por um adaptador Supabase sem refazer os componentes visuais. Os dados aprovados serão migrados para uma tabela `home_blocks` ou equivalente. A Home consultará blocos publicados a cada novo acesso/recarregamento; não haverá assinatura Realtime permanente.

Imagens públicas serão armazenadas em um bucket dedicado. Leitura pública será permitida, mas criação, alteração e exclusão dependerão de um administrador autenticado.

### 5.2 Autenticação e autorização

- Supabase Auth com e-mail e senha.
- Cadastro público desativado.
- Tabela de administradores vinculada ao identificador do usuário autenticado.
- Dois papéis: `owner` e `admin`.
- `admin` administra conteúdo.
- `owner` também convida, remove e altera administradores.
- O proprietário inicial é criado manualmente no Supabase.
- O proprietário não poderá remover ou rebaixar o próprio acesso se isso deixar o projeto sem proprietário.
- Todas as permissões serão aplicadas por políticas RLS; esconder botões no navegador não será considerado proteção.

### 5.3 Gestão de administradores

O painel terá uma área exclusiva para proprietários. Convites e alterações de usuários passarão por uma função protegida do Vercel. A função validará a sessão e o papel `owner` antes de usar a API administrativa do Supabase.

A chave `service_role` será armazenada somente nas variáveis seguras do Vercel e nunca será enviada ao navegador ou incluída no repositório.

## 6. Limites da primeira entrega

Não fazem parte da prévia local:

- criação do projeto Supabase;
- configuração de credenciais;
- autenticação real;
- upload persistente de mídia;
- funções Vercel para convites;
- migração dos dados para produção;
- publicação no GitHub ou no Vercel.

## 7. Acessibilidade e desempenho

- Conteúdo textual e controles permanecem no DOM.
- Foco visível e ordem de tabulação coerente.
- Estado expandido exposto por `aria-expanded` e relação com o painel revelado.
- Links e botões com alvos de toque adequados.
- Canvas marcado como decorativo.
- Imagens com texto alternativo quando comunicarem conteúdo.
- Texturas e imagens abaixo da dobra carregadas sob demanda.
- Densidade de pixels e antialias do Three.js limitados conforme capacidade do dispositivo.
- Pausa do renderizador quando a página estiver oculta.
- Nenhum loop de animação duplicado ao retornar pelo histórico/bfcache.
- Descarte explícito de geometria, materiais e texturas ao destruir a cena.

## 8. Estados de falha

- Sem WebGL: caminho estático e todos os blocos continuam utilizáveis.
- Falha na imagem da Home: cor/gradiente de fundo compatível mantém contraste.
- Dados locais inválidos: conteúdo padrão é restaurado sem interromper a página.
- Falha futura do Supabase: a Home usa um snapshot editorial empacotado; o painel informa a falha sem simular salvamento.
- Imagem de bloco ausente: o bloco continua válido sem espaço vazio obrigatório.

## 9. Validação da prévia local

A primeira entrega somente será considerada pronta para aprovação visual quando:

- `chegada.png` preencher corretamente desktop e mobile;
- a respiração, o som e a passagem por scroll continuarem funcionando;
- o novo fundo da Home combinar com a Chegada;
- o trajeto Three.js aparecer alinhado e contínuo;
- nenhum bloco cobrir o trajeto;
- blocos alternarem lados e somente um permanecer expandido;
- expansão funcionar com mouse, toque e teclado;
- o scroll nativo não apresentar atraso ou saltos;
- o Palácio não for acionado no final;
- o fallback sem WebGL funcionar;
- o painel local refletir mudanças no próximo acesso;
- a experiência permanecer legível em mobile e com movimento reduzido;
- os testes existentes relevantes forem atualizados sem perder as regressões de Chegada e navegação.

## 10. Critério para iniciar a segunda entrega

A integração com Supabase começará somente depois de o usuário aprovar explicitamente a prévia local da Chegada, da Home, do trajeto, dos blocos e do painel editorial.
