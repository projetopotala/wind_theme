# Atendimentos — ficha de redesign

## Rota

`/atendimentos.html`

## Objetivo

Apresentar o cuidado como um território compreensível antes de apresentar técnicas. A página deve acolher quem chega sem vocabulário prévio, oferecer busca direta a quem já sabe o que procura e conduzir ambos até uma conversa ou atendimento adequado.

## Componente atual

- Entrada: `outputs/atendimentos.html`
- Base: `outputs/css/atendimentos.css`
- Camada visual atual: `outputs/css/atendimentos-redesign.css`
- Recursos compartilhados: `outputs/js/sections/resource-hero.js`, `outputs/css/resource-hero.css`
- Navegação compartilhada: `outputs/js/shared/portal-header.js`
- Encerramento compartilhado: `outputs/js/shared/closing-transition-controller.js`, `outputs/css/section-transition.css`

## Screenshot atual

Capturado em `http://127.0.0.1:4173/atendimentos.html` em 22/09/2026. A primeira dobra usa fotografia à esquerda e, à direita, título, busca, chips e seis rotas por intenção.

## Elementos atuais por capítulo

| Capítulo | Propósito | Elementos obrigatórios | Hierarquia | Interações existentes |
| --- | --- | --- | --- | --- |
| Hero | Acolher e orientar o primeiro gesto | marca, eyebrow, título, subtítulo, frase, introdução, foto, busca, filtros, seis rotas, dois CTAs, três benefícios | título e intenção do visitante são primários; foto e frase são secundárias | busca ao digitar, chips, links, conta |
| Antes da técnica | Explicar por que a escuta precede a escolha | índice, eyebrow, título, dois parágrafos, Recepção | título primário; argumentos secundários | CTA textual |
| Possibilidades | Organizar mais de 150 caminhos sem prometer resposta única | título, introdução, Corpo, Emoções e relações, Energia e presença, Orientação | quatro famílias primárias dentro do capítulo | nenhuma além da leitura |
| Oráculos | Situar linguagens de autoconhecimento sem confundi-las com outras práticas | índice, eyebrow, título, explicação, link | atmosfera e título primários | link externo |
| Formas de chegar | Mostrar acesso presencial, online, ambulatorial e solidário | título, três modalidades e descrições | modalidades primárias | leitura |
| Primeiro passo | Converter sem pressionar | eyebrow, título, orientação, Recepção, terapias | conversa primária; catálogo secundário | dois CTAs |
| Transição | Entregar o visitante ao capítulo de aprendizagem | foto, frase, canvas atmosférico | frase e continuidade primárias | entrada por centro da viewport; clique/scroll/tecla para sair |

## Problemas observados

- A primeira dobra concentra título, narrativa, busca, filtros, resultados, benefícios e dois CTAs; em notebooks, a leitura fica comprimida apesar de todos os elementos serem úteis.
- A fotografia é forte, mas permanece como uma coluna rígida e não participa da transição para o conteúdo seguinte.
- Depois do hero, capítulos importantes são estáticos e visualmente parecidos entre si; a página perde a sensação de travessia.
- A lista de famílias de cuidado comunica bem, mas não ajuda a perceber relações entre necessidade, abordagem e forma de acesso.
- Mudanças de fundo existem, porém entram como cortes de seção, sem a linha da jornada preparando o próximo ambiente.
- Busca e chips respondem funcionalmente, mas os resultados trocam sem transição e os filtros têm feedback mínimo.

## Referência visual utilizada

`potala_atendimentos_prototipo.html` é usado como esqueleto, não como template. Foram extraídos:

- narrativa dividida em capítulos numerados;
- assimetria entre bloco editorial e experiência visual;
- espaço negativo como parte da hierarquia;
- índice local que oferece liberdade sem quebrar a ordem narrativa;
- combinação entre conhecimento, situação humana, mapa conceitual e praça de exploração;
- alternância entre superfícies claras e um território escuro de aprofundamento.

Não serão copiados a paleta, os textos do protótipo, a marca temporária, os cards translúcidos ou suas proporções exatas.

## Esqueleto adaptado

1. **Abertura — acolhimento:** o título e a frase permanecem dominantes; a foto ocupa uma moldura viva e entrega visualmente a próxima área. Um índice compacto mostra o que existe na página.
2. **Praça de caminhos:** busca, chips, rotas e benefícios ganham uma faixa própria imediatamente após a abertura. Nenhum dado do componente atual é removido.
3. **Antes da técnica:** composição editorial de duas colunas, com texto-base estável e argumentos surgindo por etapas.
4. **Espectro do cuidado:** as quatro famílias viram um índice editorial interativo; o foco muda por scroll/teclado e revela uma breve camada visual, sem esconder o texto.
5. **Oráculos:** território escuro com linha orbital discreta; o conteúdo permanece literal e acessível.
6. **Formas de chegar:** três faixas editoriais, não três cards repetidos; cada uma muda levemente o eixo para indicar modalidade.
7. **Primeiro passo:** a conversa nasce antes do fechamento e compartilha a imagem/atmosfera da transição existente.

## Vocabulário de movimento selecionado

| Animação | Referência no atlas | Onde usar | Função | Custo/peso | Mobile | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- |
| Reveal por linhas | Line-by-line reveal / #47 | título, frase e introduções | conduzir leitura sem esconder conteúdo | baixo; `opacity` + `transform` | duas etapas no máximo | fade curto |
| Título para corpo | Title-to-body continuity / #59 | hero → praça de caminhos | manter o assunto enquanto a função muda | médio; posição calculada só durante a passagem | substituído por ordem vertical | sem reposicionamento |
| Recorte progressivo da imagem | Image crop animation / #45 | fotografia do hero | fazer a imagem entregar o próximo capítulo | baixo/médio; `clip-path`/`transform` | recorte simples | imagem estática |
| Divisão sticky | Sticky split-screen / #2 | Antes da técnica e espectro | manter argumento enquanto exemplos avançam | médio; CSS `sticky` | fluxo normal | fluxo normal |
| Linha desenhada | SVG line drawing / #95 | fio da jornada entre capítulos | indicar continuidade, não decoração | baixo; `stroke-dashoffset` | linha reta curta | linha estática |
| Transição de atmosfera | Background continuity / #144 + #20 | claro → floresta dos Oráculos → papel | eliminar cortes abruptos | baixo; variável de cor/opacidade | crossfade curto | troca imediata legível |
| Busca responsiva | Animated search suggestions / #155 | resultados do `ResourceHero` | mostrar que a consulta alterou o conjunto | baixo | fade/reordenação curta | atualização imediata |
| Chips com feedback | Animated filter chips / #156 | filtros rápidos | confirmar seleção e estado | baixo | mesma lógica, menor deslocamento | cor e borda apenas |
| Reorganização de resultados | Dynamic grid reorder / #157 | lista de rotas filtradas | preservar localização mental | médio; FLIP simples sem biblioteca | fade curto | substituição imediata |
| Progresso de leitura | Progress indicator / #76 | linha superior/linha da jornada | situar o visitante na página longa | baixo | barra fina | largura atualizada sem easing |
| Transição por sobreposição | Section overlap / #145 | possibilidades → Oráculos | preparar o próximo ambiente | baixo | sobreposição menor | sem movimento |
| Footer/closing reveal | Footer reveal / #153 | transição já existente | transformar encerramento em continuidade | já implementado | simplificado | já suportado |

## Efeitos rejeitados para esta seção

- WebGL distortion, gooey reveal e image stretch: custo alto e linguagem excessivamente expressiva para um conteúdo de cuidado.
- Scroll hijacking e pinned storytelling longo: prejudicam controle, leitura e mobile.
- Cursor customizado, magnetic/proximity e partículas: pouca função informacional.
- Vídeo autoplay: aumentaria LCP e desviaria a atenção da fotografia humana já adequada.

## Comportamento no scroll

- 0–20% do hero: título, frase e imagem entram com ritmos diferentes.
- 20–55%: a moldura da fotografia reduz sutilmente e a praça de caminhos começa a aparecer.
- 55–100%: busca e benefícios assumem o foco; o hero deixa de competir.
- Nos capítulos seguintes, a linha da jornada acompanha o progresso e aproxima-se apenas dos elementos ativos.
- A passagem para Oráculos usa continuidade de fundo e sobreposição; a saída recupera o papel claro antes das modalidades de acesso.

## Mobile

- Fluxo vertical: texto → foto → índice → busca → rotas.
- Sem sticky prolongado, parallax ou recorte contínuo.
- Chips mantêm rolagem horizontal acessível; resultados usam fade curto.
- Linha da jornada vira marcador lateral simples.
- Todos os elementos continuam alcançáveis por teclado e toque.

## Arquivos previstos

- `outputs/atendimentos.html`
- `outputs/css/atendimentos-redesign.css`
- `outputs/css/resource-hero.css`
- `outputs/js/sections/resource-hero.js`
- novo módulo pequeno de movimento específico, somente se o CSS/IntersectionObserver compartilhado não bastar
- testes existentes de páginas de seção e recursos

## Componentes reutilizados

- `PortalHeader`
- `ResourceHero`
- ícones de `section-icons.js`
- `ClosingTransition`
- conta do visitante

## Critérios de validação

- nenhum conteúdo ou destino atual é removido;
- busca, chips, CTAs, conta e transição continuam funcionando;
- ausência de overflow em 1280px, 820px e 390px;
- navegação por teclado e foco visível;
- animações só usam `transform`, `opacity`, `clip-path` ou traço SVG fora de eventos discretos;
- `prefers-reduced-motion` preserva todo o conteúdo;
- sem nova dependência de animação.
