# Painel editorial — Editor da jornada

Data: 2026-09-03
Estado: aprovado no brainstorming, aguardando plano de implementação

## Contexto

O painel em `outputs/admin.html` já funciona: entra por Supabase, lista os
blocos da Home, permite arrastar para reordenar, edita os campos e mostra uma
prévia ao vivo por `postMessage` dentro de um iframe. O que falta não é
mecanismo — é forma. O cliente trouxe um mockup do "Editor da jornada" com
navegação lateral, lista com miniaturas, formulário em abas e uma coluna de
prévia com controle de dispositivo e zoom, e pediu que o painel existente
fique como a imagem.

O mockup, porém, mostra mais do que uma troca de aparência. Ele implica sete
seções de painel, um ciclo de rascunho separado do publicado e uma biblioteca
de mídia — coisas que o banco e o código não têm. Este documento recorta o
primeiro ciclo e registra o que ficou de fora e por quê.

## Escopo

### Dentro

- A casca inteira do mockup: navegação lateral com as sete seções, cabeçalho
  com busca e ações, rodapé de usuário.
- A seção **Jornada** funcionando por completo: lista, formulário em três abas,
  prévia com dispositivo e zoom, checklist de validação.
- Ciclo de rascunho e publicação, com duas versões por bloco.
- Seletor de imagem sobre as imagens que já existem no repositório.
- Duas mudanças na Home, decorrentes das anteriores: o campo `body` passa a ser
  convertido pelo Markdown restrito em vez de escapado cru, e o cartão do bloco
  ganha a descrição acessível vinda de `meta_description`.

### Fora

- As seções Visão geral, Páginas, Mídia, Programação, Profissionais e
  Configurações. Aparecem na navegação, como no mockup, e ficam inertes.
- Upload de arquivo e Supabase Storage.
- Aviso de edição concorrente (ver "Riscos aceitos").

## Decisões

Cada uma foi levantada e escolhida durante o brainstorming.

**Duas versões por bloco.** O mockup tem "Salvar rascunho", "Salvar bloco" e
"Publicar alterações" — três ações de gravar. O banco tem um booleano
`published`, que não guarda duas versões do mesmo bloco. Sem a separação,
editar um bloco publicado altera a Home na hora, sem rede de segurança.

**three.js só na prévia.** A prévia carrega a Home real dentro do iframe, então
o trajeto luminoso em three.js já anima ali — e passa a responder ao que se
digita. A casca do painel fica em CSS. Um painel editorial é ferramenta de
trabalho: canvas WebGL rodando atrás de quem passa o dia escrevendo custa
bateria e não ajuda a escrever.

**Markdown restrito, nunca HTML.** A barra de formatação do mockup decide como
o texto é guardado. Um editor rich text comum guarda HTML, e a Home hoje escapa
o `body` — para o HTML funcionar seria preciso trocar a escrita para
`innerHTML`, e aí qualquer coisa gravada no campo passa a ser executada pelo
navegador de quem visita o site. Com Markdown restrito o banco guarda texto, e
a lista de marcações permitidas é o próprio conversor: não há filtro para
esquecer de aplicar.

**Imagem escolhida, não enviada.** Sem Storage neste ciclo, a caixa "Trocar
imagem" abre uma grade das imagens que já estão em `outputs/media/`. Funciona
de verdade, tem a cara do mockup, e ninguém sobe um arquivo de 40MB.

## Arquitetura

`admin-controller.js` tem 405 linhas e já concentra lista, formulário,
validação, prévia, arrastar e reset. Somando abas, busca, filtros, contadores,
checklist, seletor de imagem, dispositivo, zoom e o ciclo de rascunho, passaria
de 800 — tamanho em que ninguém lê o arquivo inteiro e os defeitos se escondem.

| Módulo | Responsabilidade | Toca DOM |
|---|---|---|
| `admin-draft.js` | Estado de um bloco entre rascunho, publicado e pendente; o que "Publicar alterações" faz | não |
| `admin-filters.js` | Busca, abas de filtro, contadores | não |
| `markdown.js` | Conversão do Markdown restrito para HTML | não |
| `admin-shell.js` | Navegação lateral, seção ativa, rodapé, seções inertes | sim |
| `admin-blocks-list.js` | Lista, miniaturas, arrastar, kebab, badges | sim |
| `admin-editor.js` | Formulário, abas, validação, checklist | sim |
| `admin-media-picker.js` | Grade de imagens do manifesto | sim |
| `admin-preview.js` | iframe, `postMessage`, dispositivo, zoom | sim |
| `admin-controller.js` | Cola os módulos e guarda o estado | sim |

Os três primeiros são funções puras. É onde mora a lógica que erra em
silêncio, e é por isso que ela fica testável sem navegador — mesmo padrão de
`buildRibbonAttributes` e `worldShiftForPixels` no trajeto luminoso.

`markdown.js` é o único que não vive em `outputs/js/admin/`: o painel escreve
com ele e a Home lê com ele, então ele fica em `outputs/js/shared/`. Duplicar o
conversor nos dois lados seria pior que a pasta a mais — duas cópias divergem,
e a que divergisse seria justamente a que decide o que vira HTML.

`admin-auth.js` não muda.

Fora do painel: `scripts/build-media-manifest.mjs` varre `outputs/media/` e
grava um JSON com nome, dimensões e tamanho. É o que alimenta a grade.

## Dados

### Tabela `home_block_drafts`

Espelha `home_blocks` e acrescenta `updated_at timestamptz not null`.

Espelho, e não uma coluna JSONB dentro de `home_blocks`: com espelho o rascunho
carrega as mesmas restrições do publicado — `side in ('left','right')`,
`position >= 0`, slug único — e um rascunho inválido é recusado na hora de
salvar, e não na hora de publicar, quando já é tarde para avisar quem escreveu.

**A tabela não recebe `grant` para `anon`. Nem leitura.** Só `authenticated`
passando por `is_portal_admin()`, o mesmo padrão das políticas existentes.
Rascunho é texto não publicado do instituto e não pode sair por uma URL do
Supabase.

### Colunas novas, nas duas tabelas

- `title_scale text not null default 'normal'` — a Home já lê
  `data-title-scale` e entende `compact`.
- `allow_panel boolean not null default true` — o "Permitir abertura em slide".
- `meta_description text not null default ''` — vira a descrição acessível do
  cartão do bloco (`aria-description`). Guardar um campo que ninguém lê seria
  decoração; assim ele ajuda leitor de tela.

### Estados de um bloco

| Estado | Onde está | Badge |
|---|---|---|
| Rascunho | só em `home_block_drafts` | `Rascunho` |
| Publicado | em `home_blocks`, com `published` ligado | `Publicado` |
| Publicado com alterações pendentes | nas duas | `Publicado` + marca de pendente |

Os contadores do mockup — "12 blocos · 10 publicados · 2 rascunhos" — saem
daqui: doze é a união, dois são os que nunca foram ao ar.

O badge lê `published` junto com a presença em `home_blocks`. Um bloco que
está em `home_blocks` com "Exibir na jornada" desligado conta como rascunho,
porque é isso que ele é para quem visita o site: invisível. Sem essa regra, o
painel chamaria de publicado um bloco que ninguém consegue ver.

### As três ações

- **Salvar rascunho** grava em `home_block_drafts`. A Home não muda. É o que
  alimenta "Salvo há poucos segundos".
- **Salvar bloco** grava o rascunho e publica só aquele bloco.
- **Publicar alterações** chama `publish_home_block_drafts()`, `security
  definer` como as demais: copia **todos** os rascunhos para `home_blocks` e
  apaga os que subiram, **numa transação só**. Metade dos blocos publicados é
  um estado que ninguém pediu e que ninguém desfaz olhando a tela.

Publicar copia todo rascunho, inclusive o de um bloco que nunca foi ao ar.
Quem decide se ele aparece na Home é o "Exibir na jornada", não a publicação —
são duas perguntas diferentes, e misturá-las obrigaria a inventar um terceiro
conceito para dizer "gravado, mas ainda não quero mostrar". Um bloco que deve
continuar escondido vai para `home_blocks` com o toggle desligado, e o painel
segue chamando ele de rascunho pela regra do badge acima.

Descartar um rascunho apaga a linha e o bloco volta ao que está no ar. Apagar o
bloco tira das duas tabelas.

### Migração

Numerada `202609020003_`, assumindo a `0002` como base — a `0002` já foi
commitada e publicada. As colunas novas obrigam a atualizar a lista explícita
de colunas dentro de `replace_home_blocks`.

## A tela

### Navegação lateral, 220px

Logo no topo. Sete itens. O ativo ganha barra dourada de 3px à esquerda, ícone
dourado e fundo um tom acima. Os outros seis ficam com `aria-disabled="true"`,
opacidade reduzida e o rótulo "em breve": visíveis porque o mockup os mostra,
inertes porque não existem. O rodapé traz avatar, nome e papel; o chevron abre
"Definir senha" e "Sair", que hoje ficam soltos no cabeçalho.

### Cabeçalho

Busca filtra por título, categoria e resumo, com atraso curto e Esc para
limpar. "Visualizar site" abre a Home em aba nova. "Publicar alterações" fica
desabilitado sem pendências e mostra a contagem quando há. "Salvo há poucos
segundos" é o instante do último rascunho em tempo relativo, atualizando
sozinho.

### Coluna 1 — lista

Contadores derivados dos três estados. Abas Todos/Publicados/Rascunhos como
`role="tablist"`. Cada cartão traz alça de arrastar, miniatura de 64px, número
da posição, título, categoria, badge e um kebab com Duplicar, Descartar
rascunho e Apagar. O cartão ativo ganha borda dourada.

Arrastar continua com "Mover acima" e "Mover abaixo" por trás. Esse é o caminho
de teclado que já existe e não pode sumir num redesenho.

### Coluna 2 — editor

Breadcrumb, título que acompanha o que se digita, e três abas:

- **Conteúdo** — Categoria, Posição na trilha, Título, Resumo com contador
  (avisa aos 140, barra em 160), Conteúdo detalhado, Imagem do card, e os
  toggles "Exibir na jornada" e "Permitir abertura em slide".
- **Aparência** — ícone, escala do título, temas.
- **SEO** — destino, slug, descrição acessível.

Rodapé com "Salvar rascunho" e "Salvar bloco".

### Coluna 3 — prévia

Mantém o `postMessage` agendado por quadro, que já entrega tempo real. O toggle
de dispositivo troca a largura do iframe entre 1280 e 390, e a Home reage
sozinha porque as media queries são dela. O zoom aplica `transform: scale` e
compensa a largura, para que 50% mostre o dobro de página em vez de encolher a
caixa. O × recolhe a coluna e devolve o espaço ao editor. O checklist lê o
rascunho atual: título legível, resumo preenchido, imagem definida.

## Markdown restrito

A barra insere marcação em vez de produzir HTML: `**negrito**`, `*itálico*`,
`[texto](url)`, `- lista`, `1. lista`, `> citação`, linha em branco para
parágrafo.

`markdown.js` converte só essas marcas. Tudo o mais é escapado. A lista
de tags permitidas é o próprio conversor, então não existe filtro que alguém
possa esquecer de aplicar. URLs de link aceitam apenas `http:`, `https:` e
caminhos relativos — `javascript:` é descartado.

A Home passa a chamar o conversor no lugar do `escapeHtml` de hoje para o campo
`body`. Os demais campos continuam escapados.

## Erros

**Validação em duas camadas.** O formulário barra antes de mandar; as
restrições do banco são a rede embaixo. A camada de cima existe para dar
mensagem boa, a de baixo porque a de cima pode ter defeito.

**Falha ao salvar não mente.** A lista e a prévia atualizam antes da resposta
do servidor. Se a RPC recusar — `portal_admin_required`, payload grande, rede
caída — o estado volta ao que era e a faixa de status diz o que houve. Um
painel que mostra a mudança e perde a gravação em silêncio é pior que um lento.

**Prévia que não carrega** mostra o motivo e um botão de recarregar, em vez de
um retângulo vazio. O `postMessage` mantém a origem explícita.

**Manifesto ausente** deixa a grade vazia e o campo de caminho funcionando. O
painel não quebra porque um script de build não rodou.

## Testes

Os módulos puros — `admin-draft.js`, `admin-filters.js`, `markdown.js` —
vão para `node:test`, verificados por mutação, como o resto do repositório.

O conversor leva bateria de entrada hostil: `<script>`, `javascript:` em link,
marcas aninhadas, marca não fechada, HTML colado no meio do texto. O valor dele
é justamente não deixar HTML passar, então é isso que os testes precisam
provar.

Os módulos de DOM usam nós falsos, como `home-block-expansion.test.mjs` já faz.
A migração ganha teste de texto do SQL, como as que existem. O layout eu confiro
no navegador, medindo.

## Riscos aceitos

**Edição concorrente sem aviso.** A tabela de rascunho tem uma linha por bloco.
Se duas pessoas abrirem o mesmo bloco e salvarem, a segunda apaga o trabalho da
primeira sem que nenhuma das duas saiba. Foi levantado no brainstorming e o
cliente escolheu conscientemente a gravação mais recente vencendo, sem aviso, o
que é razoável enquanto uma pessoa só edita na prática. A coluna `updated_at`
do rascunho já fica no lugar, então acrescentar a checagem depois é uma
mudança pequena.

**Seis seções inertes.** A navegação promete visualmente sete áreas e entrega
uma. O rótulo "em breve" é o que impede que isso vire uma promessa quebrada.
