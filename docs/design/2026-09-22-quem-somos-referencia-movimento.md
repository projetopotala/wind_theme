# Quem somos — ficha de redesign

## Rota

`/quem-somos.html`

## Objetivo

Apresentar o Instituto como lugar e como propósito: quem é, de onde veio e o que sustenta o que ele faz. É uma página de narrativa, não de descoberta — não tem busca, filtros nem catálogo, e não deve ganhá-los. O visitante precisa sair sabendo o que é o Potala e com um caminho aberto para o que ele faz todos os dias.

## Componente atual

- Entrada: `outputs/quem-somos.html`
- Base: `outputs/css/quem-somos.css`
- Camada visual atual: `outputs/css/quem-somos-redesign.css`
- Encerramento próprio: `outputs/js/about/about-closing-controller.js`
- Navegação compartilhada: `outputs/js/shared/portal-header.js`
- Movimento compartilhado (novo): `outputs/css/movimento.css`, `outputs/js/sections/movimento.js`

## Elementos atuais por capítulo

| Capítulo | Propósito | Elementos obrigatórios | Hierarquia | Interações |
| --- | --- | --- | --- | --- |
| Hero | Dizer o que é o lugar numa frase | kicker, título, introdução, CTA para a história, "Desde 2012 · Indaiatuba", fotografia com legenda, convite para continuar | título primário; fotografia secundária | CTA, âncora, conta |
| 01 Visão | Explicar por que muitos saberes convivem | número, kicker, título, dois parágrafos | título primário; parágrafos secundários | leitura |
| História | Dar origem, data e sentido do nome | marca "2012", kicker, título, dois parágrafos | ano e título primários | leitura |
| Ecossistema | Mostrar as quatro dimensões do Instituto | kicker, título, Cuidado, Conhecimento, Movimento, Convivência (ícone, número, nome, descrição) | as quatro dimensões são primárias | hover nos cartões |
| Encerramento | Entregar o visitante ao cuidado | véu, frase de passagem, fotografia | frase primária | entrada por scroll, saída por clique/tecla |
| Rodapé | Não deixar a página sem saída | assinatura, Travessia, site oficial | leitura | dois links |

## Problemas observados

- Depois do hero a página não tem mais nenhum gesto: três capítulos seguidos de composição parecida, sem hierarquia de ritmo.
- As quatro dimensões são quatro cartões iguais, lado a lado — a forma diz "lista de produtos", e o conteúdo diz "dimensões de um mesmo lugar".
- Os capítulos não têm índice nem numeração visível: a pessoa não sabe quanto falta nem consegue voltar a um trecho.
- As trocas de ambiente (papel → floresta → papel) acontecem por corte seco.
- A página é a única seção sem fio condutor: a Travessia promete uma jornada e aqui ela desaparece.

## Referência visual utilizada

`potala_atendimentos_prototipo.html` como esqueleto, nas partes narrativas (capítulos numerados, bloco editorial assimétrico, espaço negativo, mapa de relações) — não na "praça". O conceito já gerado para esta página (`docs/design/quem-somos-ai-concept.png`) segue valendo para a primeira dobra, que não muda.

Não são copiados: paleta, textos, proporções e os cartões translúcidos da referência.

## Esqueleto adaptado

1. **Abertura:** permanece como está. Ganha o recorte suave da fotografia e a revelação por linhas.
2. **Trilha de capítulos:** faixa fina e horizontal logo abaixo do hero — diferente do índice vertical de Atendimentos, porque aqui a página é curta e linear.
3. **01 Visão:** número grande, título e os dois parágrafos deslocados para a direita, com muito espaço negativo.
4. **História:** o ano como elemento gráfico em diálogo com o texto; o fio se aproxima do ano.
5. **Ecossistema:** as quatro dimensões deixam de ser cartões e viram uma constelação editorial — posições alternadas dentro de uma órbita tênue, escala variando com o foco da leitura.
6. **Encerramento:** o papel do ecossistema dissolve no papel claro do encerramento que já existe.

## Vocabulário de movimento selecionado

| Animação | Referência no atlas | Onde usar | Função | Custo | Mobile | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- |
| Reveal por linhas | Line-by-line reveal / #47 | títulos e parágrafos de cada capítulo | conduzir a leitura | baixo (`opacity`/`transform`) | dois passos | fade imediato |
| Linha desenhada | SVG line drawing / #95 | fio da jornada ligando os capítulos | continuidade da travessia | baixo (`stroke-dashoffset`) | oculto | traço estático |
| Progresso de leitura | Progress indicator / #76 | topo da página | situar numa página longa | baixo | barra fina | sem easing |
| Recorte progressivo | Image crop animation / #45 | fotografia do hero | a foto entrega o próximo capítulo | baixo (`clip-path`) | sem recorte | imagem estática |
| Continuidade de fundo | Background continuity / #144 | papel → floresta → papel | trocar de ambiente sem corte | baixo (gradiente) | mantida | mantida |
| Foco por proximidade | Scroll spy / #64 | constelação do ecossistema | dizer onde a leitura está sem esconder texto | baixo | ativa por toque/foco | só cor |
| Escala no foco | Scroll scale-up / #12 | ícone e nome da dimensão ativa | dar peso à dimensão lida | baixo (`transform`) | reduzida | sem escala |

## Efeitos rejeitados

- Pinned storytelling e scroll hijacking: a página é curta; prender o scroll aqui seria só efeito.
- Cartão que expande: transformaria dimensões em produtos.
- Parallax múltiplo e WebGL: custo alto para uma página de texto.
- Contador animado no "2012": número de data não é métrica; contar seria decorativo.

## Comportamento no scroll

- 0–25% do hero: kicker, título, introdução e CTA entram em ritmos diferentes; a fotografia recorta de leve ao sair.
- Trilha de capítulos aparece ao fim do hero e marca o capítulo atual dali em diante.
- Em cada capítulo o fio se aproxima do marcador (número, ano, título) e segue.
- No ecossistema, a dimensão mais próxima do centro da tela ganha foco; as outras continuam legíveis.
- A saída do ecossistema já é o papel claro do encerramento existente.

## Mobile

- Sem fio, sem recorte e sem órbita; a trilha vira uma linha rolável horizontal.
- A constelação vira uma coluna: mesma ordem, sem deslocamentos.
- O foco por proximidade continua, acionado por toque e por foco de teclado.

## Arquivos previstos

- `outputs/quem-somos.html`
- `outputs/css/quem-somos-redesign.css`
- `outputs/css/movimento.css` e `outputs/js/sections/movimento.js` (reúso, sem alteração)
- `tests/potala/movimento-secoes.test.mjs`

## Componentes reutilizados

- `PortalHeader`
- fio, progresso, revelação e foco de `movimento.js`
- encerramento próprio do Quem somos
- conta do visitante

## Critérios de validação

- nenhum texto, link ou destino atual é removido;
- as quatro dimensões continuam legíveis sem interação;
- sem overflow horizontal em 1280px, 820px e 390px;
- foco visível e navegação por teclado em toda a constelação;
- animações só em `transform`, `opacity`, `clip-path` e traço de SVG;
- `prefers-reduced-motion` preserva conteúdo e navegação;
- nenhuma dependência nova.
