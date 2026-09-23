# Recepção — ficha de redesign

## Rota

`/recepcao.html`

## Objetivo

Ser a porta de entrada: acolher quem chega sem saber o que procura, levar direto quem já sabe, e deixar claro que existe gente do outro lado. É a página mais funcional das três primeiras — aqui a pessoa escolhe por onde seguir, pergunta, telefona ou deixa um retorno.

## Componente atual

- Entrada: `outputs/recepcao.html`
- Base: `outputs/css/recepcao.css`
- Camada visual atual: `outputs/css/recepcao-redesign.css`
- Prévias: `outputs/js/shared/assistente.js` (conversa) e o retorno em `data-feedback-preview`
- Movimento compartilhado: `outputs/css/movimento.css`, `outputs/js/sections/movimento.js`

## Elementos atuais por capítulo

| Capítulo | Propósito | Elementos obrigatórios | Hierarquia | Interações |
| --- | --- | --- | --- | --- |
| Hero | Dizer o que é a Recepção e abrir quatro rotas | kicker, título, frase, resumo, dois CTAs, retrato com palavras e legenda, quatro rotas de intenção | título e rotas primários | links, conta |
| 01 Antes de escolher | Explicar que o primeiro gesto é escutar | número, kicker, título, dois parágrafos | título primário | leitura |
| O que você precisa hoje | Oferecer as oito portas de chegada | oito caminhos com número, nome, descrição e ação; dois deles com rótulo próprio (orientação solidária e acolhimento prioritário) | os oito são primários; os dois rotulados pesam mais | oito links |
| Assistente | Mostrar a prévia da conversa futura | kicker, título, aviso de que nada é enviado, campo, três sugestões, status | aviso e campo primários | formulário de prévia |
| Fale conosco | Provar que existe atendimento humano | kicker, título, endereço, WhatsApp, telefone, e-mail | endereço e contatos primários | três links |
| Retorno | Perguntar se a pessoa encontrou o que queria | kicker, título, três respostas, status | resposta primária | três botões |
| Encerramento | Devolver à Travessia | frase, link | frase primária | um link |

## Problemas observados

- As oito portas são oito linhas idênticas de quase três mil pixels: todas gritam no mesmo tom, inclusive as duas que deveriam pesar mais (Aconselhamento Holístico e Preciso de ajuda).
- Fora do hero não há nenhum sinal de progresso: a página é a mais longa da área e não diz onde a pessoa está.
- As trocas de ambiente (papel → tinta → papel → floresta → tinta) são cortes secos, apesar de a alternância já existir.
- O retrato do hero é forte, mas não participa da passagem para o capítulo seguinte.
- "Posso ajudar você?" era o mesmo título em dois capítulos (assistente e contato). Resolvido com autorização: o contato passou a se chamar **"Venha, escreva ou ligue."**, que é o que aquele bloco realmente oferece — endereço, WhatsApp, telefone e e-mail. A frase original ficou com o assistente, e com a porta 02 que leva até ele: ali a repetição é proposital, porque a porta tem o nome do seu destino.

## Referência visual utilizada

`potala_atendimentos_prototipo.html` como esqueleto, nas partes de serviço: numeração editorial, assimetria, hierarquia por escala e alternância entre papel e território escuro. O conceito já gerado (`docs/design/recepcao-ai-concept.png`) segue valendo para a primeira dobra, que não muda.

O índice desta página não é uma lista à parte: são as quatro rotas do hero, que já existem. Foi por isso que ela não ganhou trilha nem índice lateral — seria um terceiro menu na mesma tela.

## Esqueleto adaptado

1. **Abertura:** permanece. Ganha revelação por linhas, recorte suave do retrato e entrada escalonada das quatro rotas.
2. **01 Antes de escolher:** número e título à esquerda, parágrafos à direita, com o primeiro parágrafo em escala de abertura.
3. **As oito portas:** deixam de ser oito linhas iguais. Seis viram pares em duas colunas, com título em escala menor; as duas rotuladas atravessam a largura inteira e mantêm a escala grande. A porta que está sendo lida ganha peso pelo número.
4. **Assistente:** território escuro, com a passagem entrando e saindo por continuidade de fundo.
5. **Fale conosco:** o lado humano, no papel claro, logo depois da prévia da máquina.
6. **Retorno e encerramento:** mantêm o que existe, com revelação e passagem suave.

## Vocabulário de movimento selecionado

| Animação | Referência no atlas | Onde usar | Função | Custo | Mobile | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- |
| Reveal por linhas | Line-by-line reveal / #47 | títulos, parágrafos e rotas | conduzir a leitura | baixo | dois passos | fade imediato |
| Entrada escalonada | Staggered text / #50 | quatro rotas do hero | mostrar que são alternativas, não uma lista | baixo | mesma ordem, atraso menor | tudo junto |
| Linha desenhada | SVG line drawing / #95 | fio ligando os capítulos | continuidade da travessia | baixo | oculto | traço estático |
| Progresso de leitura | Progress indicator / #76 | topo | situar na página mais longa da área | baixo | barra fina | sem easing |
| Recorte progressivo | Image crop animation / #45 | retrato do hero | entregar o capítulo seguinte | baixo | sem recorte | estático |
| Continuidade de fundo | Background continuity / #144 | papel → tinta → papel → floresta → tinta | trocar de ambiente sem corte | baixo | mantida | mantida |
| Foco por proximidade | Scroll spy / #64 | as oito portas | dizer onde a leitura está sem esconder nada | baixo | por toque e foco | só cor |

## Efeitos rejeitados

- Acordeão nas oito portas: esconderia conteúdo que hoje está visível.
- Carrossel horizontal: transformaria decisões em vitrine.
- Cursor magnético e partículas no hero: nenhum ganho informacional.
- Digitação simulada no assistente: sugeriria uma resposta que ainda não existe.

## Comportamento no scroll

- 0–25% do hero: kicker, título, frase e CTAs entram em ritmos diferentes; as quatro rotas entram em sequência.
- O retrato recorta de leve ao sair e entrega o capítulo 01.
- Em cada capítulo o fio se aproxima do marcador e segue.
- Nas oito portas, a que está mais perto do centro da tela ganha peso.
- Cada troca de ambiente começa antes do fim do capítulo anterior.

## Mobile

- Sem fio e sem recorte; portas em coluna única, na mesma ordem.
- As rotas do hero continuam alcançáveis por toque, uma embaixo da outra.
- Foco por toque e por teclado; nenhum conteúdo depende de hover.

## Arquivos previstos

- `outputs/recepcao.html`
- `outputs/css/recepcao-redesign.css`
- reúso de `movimento.css` e `movimento.js`
- `tests/potala/movimento-secoes.test.mjs`

## Critérios de validação

- nenhum texto, telefone, endereço ou link é removido;
- as oito portas continuam legíveis e clicáveis sem interação nenhuma;
- sem overflow horizontal em 1280px, 820px e 390px;
- foco visível em todas as portas e nos contatos;
- animações só em `transform`, `opacity`, `clip-path` e traço de SVG;
- `prefers-reduced-motion` preserva conteúdo e navegação;
- as prévias (assistente e retorno) continuam funcionando como antes.
